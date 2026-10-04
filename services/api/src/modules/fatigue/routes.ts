import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../prisma.js";
import { recordAuditEvent } from "../audit/index.js";

// FatigueRule authorship is modelled like a RequirementSet: draft, then
// published. It has no organisationId (it is cross-organisation safety
// policy, not any one LHN's own rule), so it reuses SCOPE_APPROVER — the
// closest existing authority for "defines a gating policy" — rather than
// inventing a new role.
const RULE_AUTHOR_ROLE = "SCOPE_APPROVER" as const;
const READ_ROLES = ["MEDICAL_WORKFORCE", "CREDENTIAL_OFFICER", "SCOPE_APPROVER"] as const;

const createRuleBody = z.object({
  code: z.string().min(1),
  parametersJson: z.record(z.unknown()),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional(),
});

const declareWorkEpisodeBody = z.object({
  organisationId: z.string().uuid().optional(),
  facilityId: z.string().uuid().optional(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
});

const declareFatigueBody = z.object({
  vacancyId: z.string().uuid().optional(),
  statement: z.string().min(1),
});

export function registerFatigueRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------
  // FatigueRule authoring
  // -------------------------------------------------------------------
  app.post(
    "/v1/fatigue-rules",
    { preHandler: [app.authenticate, app.requireOrgRole(RULE_AUTHOR_ROLE)] },
    async (request, reply) => {
      const parsed = createRuleBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const rule = await prisma.fatigueRule.create({
        data: { ...parsed.data, parametersJson: parsed.data.parametersJson as Prisma.InputJsonValue },
      });

      await recordAuditEvent(prisma, {
        eventType: "fatigue.rule.create",
        actorId: request.authUser!.id,
        resourceType: "FatigueRule",
        resourceId: rule.id,
        outcome: "success",
        metadata: { code: rule.code },
      });

      reply.code(201).send(rule);
    },
  );

  app.post(
    "/v1/fatigue-rules/:id/publish",
    { preHandler: [app.authenticate, app.requireOrgRole(RULE_AUTHOR_ROLE)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const existing = await prisma.fatigueRule.findUnique({ where: { id } });
      if (!existing) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      if (existing.status !== "DRAFT") {
        reply.code(409).send({ error: `Rule is ${existing.status}, not DRAFT` });
        return;
      }

      const rule = await prisma.fatigueRule.update({ where: { id }, data: { status: "PUBLISHED" } });

      await recordAuditEvent(prisma, {
        eventType: "fatigue.rule.publish",
        actorId: request.authUser!.id,
        resourceType: "FatigueRule",
        resourceId: id,
        outcome: "success",
      });

      reply.send(rule);
    },
  );

  app.get("/v1/fatigue-rules", { preHandler: [app.authenticate, app.requireOrgRole(...READ_ROLES)] }, async (_request, reply) => {
    const rules = await prisma.fatigueRule.findMany({ orderBy: { effectiveFrom: "desc" } });
    reply.send(rules);
  });

  // -------------------------------------------------------------------
  // Doctor-facing: self-declared work episodes and fatigue declarations
  // -------------------------------------------------------------------
  app.post("/v1/practitioners/me/work-episodes", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const parsed = declareWorkEpisodeBody.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    if (parsed.data.endAt <= parsed.data.startAt) {
      reply.code(400).send({ error: "endAt must be after startAt" });
      return;
    }

    const episode = await prisma.workEpisode.create({
      data: {
        practitionerId: request.authUser.practitionerId,
        source: "SELF_DECLARED",
        assuranceLevel: "DECLARED",
        ...parsed.data,
      },
    });

    await recordAuditEvent(prisma, {
      eventType: "fatigue.work-episode.self-declare",
      actorId: request.authUser.id,
      resourceType: "WorkEpisode",
      resourceId: episode.id,
      outcome: "success",
    });

    reply.code(201).send(episode);
  });

  app.get("/v1/practitioners/me/work-episodes", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const episodes = await prisma.workEpisode.findMany({
      where: { practitionerId: request.authUser.practitionerId },
      orderBy: { startAt: "desc" },
    });
    reply.send(episodes);
  });

  app.post("/v1/practitioners/me/fatigue-declarations", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const parsed = declareFatigueBody.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }

    const declaration = await prisma.fatigueDeclaration.create({
      data: { practitionerId: request.authUser.practitionerId, ...parsed.data },
    });

    await recordAuditEvent(prisma, {
      eventType: "fatigue.declaration.create",
      actorId: request.authUser.id,
      resourceType: "FatigueDeclaration",
      resourceId: declaration.id,
      outcome: "success",
    });

    reply.code(201).send(declaration);
  });

  app.get("/v1/practitioners/me/fatigue-declarations", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const declarations = await prisma.fatigueDeclaration.findMany({
      where: { practitionerId: request.authUser.practitionerId },
      orderBy: { declaredAt: "desc" },
    });
    reply.send(declarations);
  });

  // -------------------------------------------------------------------
  // Staff-facing: cross-organisation visibility of a practitioner's work
  // episodes. Deliberately not filtered to the requesting organisation's
  // own episodes — the point of this endpoint is that LHN B can see LHN
  // A's bookings for the same practitioner, which is the whole reason
  // this is called out as a "cross-organisation safety" context.
  // -------------------------------------------------------------------
  app.get(
    "/v1/organisations/:organisationId/practitioners/:practitionerId/fatigue-episodes",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...READ_ROLES)] },
    async (request, reply) => {
      const { practitionerId } = request.params as { organisationId: string; practitionerId: string };
      const episodes = await prisma.workEpisode.findMany({
        where: { practitionerId },
        include: { facility: true },
        orderBy: { startAt: "desc" },
      });
      reply.send(
        episodes.map((e) => ({
          id: e.id,
          facility: e.facility ? { id: e.facility.id, name: e.facility.name } : null,
          startAt: e.startAt,
          endAt: e.endAt,
          source: e.source,
          assuranceLevel: e.assuranceLevel,
        })),
      );
    },
  );
}
