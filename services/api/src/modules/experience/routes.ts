import type { FastifyInstance } from "fastify";
import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../prisma.js";
import { env } from "../../config/env.js";
import { recordAuditEvent } from "../audit/index.js";
import { computeExperienceAggregate } from "./aggregate.js";

const READ_ROLES = ["MEDICAL_WORKFORCE", "CREDENTIAL_OFFICER", "SCOPE_APPROVER"] as const;
// Improvement actions have no organisationId column to gate on (see the
// module doc comment) so, like FatigueRule, authorship is role-gated only.
const IMPROVEMENT_ACTION_ROLE = "MEDICAL_WORKFORCE" as const;

const scoreSchema = z.object({
  culture: z.number().min(1).max(5),
  support: z.number().min(1).max(5),
  orientation: z.number().min(1).max(5),
  workload: z.number().min(1).max(5),
  returnIntention: z.number().min(1).max(5),
});

const submitResponseBody = z.object({
  bookingEpisodeId: z.string().uuid().optional(),
  siteFacilityId: z.string().uuid().optional(),
  roleTemplateId: z.string().uuid().optional(),
  period: z.coerce.date().optional(),
  scores: scoreSchema,
  freeText: z.string().max(4000).optional(),
  // A doctor can withhold a response from aggregate reporting entirely —
  // e.g. it describes something identifying or a safety concern — rather
  // than relying on a content-moderation step this platform doesn't have.
  flagSensitive: z.boolean().optional(),
});

const createImprovementActionBody = z.object({
  siteFacilityId: z.string().uuid().optional(),
  theme: z.string().min(1).optional(),
  title: z.string().min(1),
  action: z.string().min(1).optional(),
  owner: z.string().min(1).optional(),
  dueDate: z.coerce.date().optional(),
  sourcePeriodStart: z.coerce.date().optional(),
  sourcePeriodEnd: z.coerce.date().optional(),
});

const updateImprovementActionBody = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
  owner: z.string().min(1).optional(),
  dueDate: z.coerce.date().optional(),
});

// Deterministic but keyed, so the pseudonym can't be reconstructed without
// the platform's own secret — reuses the existing JWT signing secret rather
// than introducing a second one to manage, which is an acceptable pilot
// simplification, not a production key-management story.
function analyticsKeyFor(practitionerId: string) {
  return createHmac("sha256", env.jwtSecretKey).update(practitionerId).digest("hex");
}

export function registerExperienceRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------
  // Doctor-facing: confidential post-shift survey
  // -------------------------------------------------------------------
  app.post("/v1/practitioners/me/experience-responses", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const parsed = submitResponseBody.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    const { scores, flagSensitive, ...rest } = parsed.data;

    const response = await prisma.experienceResponse.create({
      data: {
        practitionerId: request.authUser.practitionerId,
        practitionerAnalyticsKey: analyticsKeyFor(request.authUser.practitionerId),
        scoresJson: scores as Prisma.InputJsonValue,
        reportability: flagSensitive ? "RESTRICTED" : "AGGREGATABLE",
        ...rest,
      },
    });

    // Audited by id only — never log scoresJson/freeText, which is
    // confidential feedback, not an operational event detail.
    await recordAuditEvent(prisma, {
      eventType: "experience.response.submit",
      actorId: request.authUser.id,
      resourceType: "ExperienceResponse",
      resourceId: response.id,
      outcome: "success",
    });

    reply.code(201).send({ id: response.id, submittedAt: response.submittedAt, reportability: response.reportability });
  });

  app.get("/v1/practitioners/me/experience-responses", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const responses = await prisma.experienceResponse.findMany({
      where: { practitionerId: request.authUser.practitionerId },
      orderBy: { submittedAt: "desc" },
    });
    reply.send(
      responses.map((r) => ({
        id: r.id,
        submittedAt: r.submittedAt,
        scores: r.scoresJson,
        freeText: r.freeText,
        reportability: r.reportability,
      })),
    );
  });

  // -------------------------------------------------------------------
  // Staff-facing: aggregated-only dashboard. No route anywhere in this
  // module returns a raw ExperienceResponse (practitioner identity or free
  // text) to staff — only computeExperienceAggregate's n-gated shape.
  // -------------------------------------------------------------------
  app.get(
    "/v1/organisations/:organisationId/experience-aggregate",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...READ_ROLES)] },
    async (request, reply) => {
      const { organisationId } = request.params as { organisationId: string };
      const aggregate = await computeExperienceAggregate(prisma, organisationId);
      reply.send(aggregate);
    },
  );

  // -------------------------------------------------------------------
  // Improvement actions
  // -------------------------------------------------------------------
  app.post(
    "/v1/improvement-actions",
    { preHandler: [app.authenticate, app.requireOrgRole(IMPROVEMENT_ACTION_ROLE)] },
    async (request, reply) => {
      const parsed = createImprovementActionBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const action = await prisma.improvementAction.create({ data: parsed.data });

      await recordAuditEvent(prisma, {
        eventType: "experience.improvement-action.create",
        actorId: request.authUser!.id,
        resourceType: "ImprovementAction",
        resourceId: action.id,
        outcome: "success",
      });

      reply.code(201).send(action);
    },
  );

  app.get(
    "/v1/improvement-actions",
    { preHandler: [app.authenticate, app.requireOrgRole(...READ_ROLES)] },
    async (_request, reply) => {
      const actions = await prisma.improvementAction.findMany({ orderBy: [{ status: "asc" }, { dueDate: "asc" }] });
      reply.send(actions);
    },
  );

  app.patch(
    "/v1/improvement-actions/:id",
    { preHandler: [app.authenticate, app.requireOrgRole(IMPROVEMENT_ACTION_ROLE)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateImprovementActionBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const existing = await prisma.improvementAction.findUnique({ where: { id } });
      if (!existing) {
        reply.code(404).send({ error: "Not found" });
        return;
      }

      const action = await prisma.improvementAction.update({ where: { id }, data: parsed.data });

      await recordAuditEvent(prisma, {
        eventType: "experience.improvement-action.update",
        actorId: request.authUser!.id,
        resourceType: "ImprovementAction",
        resourceId: id,
        outcome: "success",
      });

      reply.send(action);
    },
  );
}
