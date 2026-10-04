import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../prisma.js";
import { recordAuditEvent } from "../audit/index.js";

// AreaOfNeedDetermination is "modelled like ScopeGrant" (docs/addendum/
// v0.3-addendum.md §2), so it reuses SCOPE_APPROVER's authority.
// MoratoriumStatus is a compliance/verification determination closer to
// modules/passport's credentialing domain, so it reuses CREDENTIAL_OFFICER
// instead — neither addendum section names a new role, and both already
// exist in OrganisationRole.
const AREA_OF_NEED_ROLE = "SCOPE_APPROVER" as const;
const MORATORIUM_ROLE = "CREDENTIAL_OFFICER" as const;
const READ_ROLES = ["MEDICAL_WORKFORCE", "CREDENTIAL_OFFICER", "SCOPE_APPROVER"] as const;

const issueAreaOfNeedBody = z.object({
  practitionerId: z.string().uuid(),
  facilityId: z.string().uuid().optional(),
  positionRef: z.string().min(1).optional(),
  classification: z.string().min(1),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional(),
});

const recordMoratoriumBody = z.object({
  practitionerId: z.string().uuid(),
  facilityId: z.string().uuid().optional(),
  dwsAreaCode: z.string().min(1).optional(),
  restricted: z.boolean().default(true),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional(),
  source: z.string().min(1).optional(),
});

export function registerWorkforceAccessRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------
  // Area of Need determinations
  // -------------------------------------------------------------------
  app.post(
    "/v1/organisations/:organisationId/area-of-need",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", AREA_OF_NEED_ROLE)] },
    async (request, reply) => {
      const parsed = issueAreaOfNeedBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const { organisationId } = request.params as { organisationId: string };
      const { practitionerId, facilityId, ...rest } = parsed.data;

      const practitioner = await prisma.practitioner.findUnique({ where: { id: practitionerId } });
      if (!practitioner) {
        reply.code(400).send({ error: "Unknown practitioner" });
        return;
      }
      if (facilityId) {
        const facility = await prisma.facility.findUnique({ where: { id: facilityId } });
        if (!facility || facility.organisationId !== organisationId) {
          reply.code(400).send({ error: "Unknown facility for this organisation" });
          return;
        }
      }

      const determination = await prisma.areaOfNeedDetermination.create({
        data: {
          practitionerId,
          facilityId,
          organisationId,
          determiningAuthority: organisationId,
          ...rest,
        },
      });

      await recordAuditEvent(prisma, {
        eventType: "workforce-access.area-of-need.issue",
        actorId: request.authUser!.id,
        actingOrgId: organisationId,
        resourceType: "AreaOfNeedDetermination",
        resourceId: determination.id,
        outcome: "success",
        metadata: { practitionerId, facilityId },
      });

      reply.code(201).send(determination);
    },
  );

  app.get(
    "/v1/organisations/:organisationId/area-of-need",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...READ_ROLES)] },
    async (request, reply) => {
      const { organisationId } = request.params as { organisationId: string };
      const { practitionerId } = request.query as { practitionerId?: string };
      const determinations = await prisma.areaOfNeedDetermination.findMany({
        where: { organisationId, ...(practitionerId ? { practitionerId } : {}) },
        include: { practitioner: true, facility: true },
      });
      reply.send(
        determinations.map((d) => ({
          id: d.id,
          practitioner: { id: d.practitioner.id, displayName: d.practitioner.displayName, email: d.practitioner.email },
          facility: d.facility ? { id: d.facility.id, name: d.facility.name } : null,
          positionRef: d.positionRef,
          classification: d.classification,
          status: d.status,
          effectiveFrom: d.effectiveFrom,
          effectiveTo: d.effectiveTo,
        })),
      );
    },
  );

  app.post(
    "/v1/organisations/:organisationId/area-of-need/:id/withdraw",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", AREA_OF_NEED_ROLE)] },
    async (request, reply) => {
      const { organisationId, id } = request.params as { organisationId: string; id: string };
      const existing = await prisma.areaOfNeedDetermination.findUnique({ where: { id } });
      if (!existing || existing.organisationId !== organisationId) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      if (existing.status !== "ACTIVE") {
        reply.code(409).send({ error: `Determination is ${existing.status}, not ACTIVE` });
        return;
      }

      await prisma.areaOfNeedDetermination.update({ where: { id }, data: { status: "WITHDRAWN" } });

      await recordAuditEvent(prisma, {
        eventType: "workforce-access.area-of-need.withdraw",
        actorId: request.authUser!.id,
        actingOrgId: organisationId,
        resourceType: "AreaOfNeedDetermination",
        resourceId: id,
        outcome: "success",
      });

      reply.code(204).send();
    },
  );

  // Doctor-facing: their own determinations, read-only.
  app.get("/v1/practitioners/me/area-of-need", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const determinations = await prisma.areaOfNeedDetermination.findMany({
      where: { practitionerId: request.authUser.practitionerId },
      include: { facility: true },
    });
    reply.send(
      determinations.map((d) => ({
        id: d.id,
        facility: d.facility ? d.facility.name : null,
        positionRef: d.positionRef,
        classification: d.classification,
        status: d.status,
        effectiveFrom: d.effectiveFrom,
        effectiveTo: d.effectiveTo,
      })),
    );
  });

  // -------------------------------------------------------------------
  // Moratorium / DWS status
  // -------------------------------------------------------------------
  app.post(
    "/v1/organisations/:organisationId/moratorium-status",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", MORATORIUM_ROLE)] },
    async (request, reply) => {
      const parsed = recordMoratoriumBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const { organisationId } = request.params as { organisationId: string };
      const { practitionerId, facilityId, ...rest } = parsed.data;

      const practitioner = await prisma.practitioner.findUnique({ where: { id: practitionerId } });
      if (!practitioner) {
        reply.code(400).send({ error: "Unknown practitioner" });
        return;
      }
      if (facilityId) {
        const facility = await prisma.facility.findUnique({ where: { id: facilityId } });
        if (!facility || facility.organisationId !== organisationId) {
          reply.code(400).send({ error: "Unknown facility for this organisation" });
          return;
        }
      }

      const status = await prisma.moratoriumStatus.create({ data: { practitionerId, facilityId, ...rest } });

      await recordAuditEvent(prisma, {
        eventType: "workforce-access.moratorium-status.record",
        actorId: request.authUser!.id,
        actingOrgId: organisationId,
        resourceType: "MoratoriumStatus",
        resourceId: status.id,
        outcome: "success",
        metadata: { practitionerId, restricted: status.restricted },
      });

      reply.code(201).send(status);
    },
  );

  // Not org-scoped on read — a moratorium/DWS status is a Commonwealth
  // determination about the practitioner, not this organisation's own
  // record, so any staff role that can see area-of-need data can see it.
  app.get(
    "/v1/organisations/:organisationId/moratorium-status",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...READ_ROLES)] },
    async (request, reply) => {
      const { practitionerId } = request.query as { practitionerId?: string };
      if (!practitionerId) {
        reply.code(400).send({ error: "practitionerId query parameter is required" });
        return;
      }
      const statuses = await prisma.moratoriumStatus.findMany({
        where: { practitionerId },
        include: { facility: true },
      });
      reply.send(
        statuses.map((s) => ({
          id: s.id,
          facility: s.facility ? { id: s.facility.id, name: s.facility.name } : null,
          dwsAreaCode: s.dwsAreaCode,
          restricted: s.restricted,
          effectiveFrom: s.effectiveFrom,
          effectiveTo: s.effectiveTo,
          source: s.source,
        })),
      );
    },
  );

  app.get("/v1/practitioners/me/moratorium-status", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const statuses = await prisma.moratoriumStatus.findMany({
      where: { practitionerId: request.authUser.practitionerId },
      include: { facility: true },
    });
    reply.send(
      statuses.map((s) => ({
        id: s.id,
        facility: s.facility ? s.facility.name : null,
        dwsAreaCode: s.dwsAreaCode,
        restricted: s.restricted,
        effectiveFrom: s.effectiveFrom,
        effectiveTo: s.effectiveTo,
      })),
    );
  });
}
