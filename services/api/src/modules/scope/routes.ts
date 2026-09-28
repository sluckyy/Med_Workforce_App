import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma, RequirementSetStatus, ScopeGrantStatus } from "@prisma/client";
import { prisma } from "../../prisma.js";
import { recordAuditEvent } from "../audit/index.js";

// Staff who can read this organisation's scope/requirement data. Broader
// than who can write it — a workforce coordinator needs to see scope to
// match candidates later, even though only a Scope Approver can decide it.
const READ_ROLES = ["MEDICAL_WORKFORCE", "CREDENTIAL_OFFICER", "SCOPE_APPROVER"] as const;
// Who can author RoleTemplate/RequirementSet/Facility rows.
const AUTHOR_ROLES = ["CREDENTIAL_OFFICER", "SCOPE_APPROVER"] as const;
// Who can make the actual scope decision (issue/suspend/withdraw a
// ScopeGrant) — matches the spec's §24 RBAC table: "Scope Approver: Scope
// decision records within delegated organisation".
const DECIDE_ROLES = ["SCOPE_APPROVER"] as const;

const REQUIREMENT_TYPES = [
  "ACTIVE_SCOPE",
  "REGISTRATION",
  "CREDENTIAL",
  "SPECIALTY",
  "EXPERIENCE",
  "TRAINING",
  "AVAILABILITY",
  "FATIGUE",
  "PROCUREMENT",
  "COMMERCIAL",
  "PREFERENCE",
  "AREA_OF_NEED",
  "MORATORIUM_LOCATION",
  "VISA_WORK_RIGHTS",
  "TELEHEALTH_MEDICARE_ELIGIBILITY",
  "CROSS_BORDER_PRESCRIBING_AUTHORITY",
  "TECHNOLOGY_CREDENTIAL",
] as const;

const createFacilityBody = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
});

const createRoleTemplateBody = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  serviceType: z.string().min(1).optional(),
  deliveryMode: z.enum(["IN_PERSON", "TELEHEALTH_SYNCHRONOUS", "HYBRID"]).optional(),
});

const requirementInput = z.object({
  code: z.string().min(1),
  type: z.enum(REQUIREMENT_TYPES),
  hard: z.boolean().default(true),
  // Names a function in modules/eligibility/evaluators.ts. A type with no
  // matching evaluator implementation always resolves UNKNOWN, never an
  // optimistic PASS — see that module for the registry.
  evaluator: z.string().min(1),
  parameters: z.record(z.unknown()).optional(),
  failureMessage: z.string().min(1).optional(),
  unknownMessage: z.string().min(1).optional(),
});

const createRequirementSetBody = z.object({
  requirements: z.array(requirementInput).min(1),
});

const issueScopeGrantBody = z.object({
  practitionerId: z.string().uuid(),
  roleActivityCode: z.string().min(1),
  facilityIds: z.array(z.string().uuid()).min(1),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional(),
  restrictions: z.record(z.unknown()).optional(),
  supervisionLevel: z.string().min(1).optional(),
  decisionReference: z.string().min(1).optional(),
});

export function registerScopeRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------
  // Facilities — minimal stand-in for the (still-stubbed) Organisation &
  // Service bounded context. ScopeGrantFacility needs real facility rows
  // to reference; this is just enough to create them, not that module's
  // full ownership (departments/services, status lifecycle, etc.).
  // -------------------------------------------------------------------
  app.post(
    "/v1/organisations/:organisationId/facilities",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...AUTHOR_ROLES)] },
    async (request, reply) => {
      const parsed = createFacilityBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const { organisationId } = request.params as { organisationId: string };
      const facility = await prisma.facility.create({
        data: { organisationId, code: parsed.data.code, name: parsed.data.name },
      });
      reply.code(201).send(facility);
    },
  );

  app.get(
    "/v1/organisations/:organisationId/facilities",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...READ_ROLES)] },
    async (request, reply) => {
      const { organisationId } = request.params as { organisationId: string };
      const facilities = await prisma.facility.findMany({ where: { organisationId } });
      reply.send(facilities);
    },
  );

  // -------------------------------------------------------------------
  // Role templates & requirement sets
  // -------------------------------------------------------------------
  app.post(
    "/v1/organisations/:organisationId/role-templates",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...AUTHOR_ROLES)] },
    async (request, reply) => {
      const parsed = createRoleTemplateBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const { organisationId } = request.params as { organisationId: string };
      const roleTemplate = await prisma.roleTemplate.create({
        data: { ownerOrgId: organisationId, ...parsed.data },
      });
      reply.code(201).send(roleTemplate);
    },
  );

  app.get(
    "/v1/organisations/:organisationId/role-templates",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...READ_ROLES)] },
    async (request, reply) => {
      const { organisationId } = request.params as { organisationId: string };
      const roleTemplates = await prisma.roleTemplate.findMany({ where: { ownerOrgId: organisationId } });
      reply.send(roleTemplates);
    },
  );

  app.get(
    "/v1/organisations/:organisationId/role-templates/:id",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...READ_ROLES)] },
    async (request, reply) => {
      const { organisationId, id } = request.params as { organisationId: string; id: string };
      const roleTemplate = await prisma.roleTemplate.findUnique({
        where: { id },
        include: { requirementSets: { include: { requirements: true }, orderBy: { version: "desc" } } },
      });
      if (!roleTemplate || roleTemplate.ownerOrgId !== organisationId) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      reply.send(roleTemplate);
    },
  );

  app.post(
    "/v1/organisations/:organisationId/role-templates/:id/requirement-sets",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...AUTHOR_ROLES)] },
    async (request, reply) => {
      const parsed = createRequirementSetBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const { organisationId, id } = request.params as { organisationId: string; id: string };

      const roleTemplate = await prisma.roleTemplate.findUnique({
        where: { id },
        include: { requirementSets: { select: { version: true }, orderBy: { version: "desc" }, take: 1 } },
      });
      if (!roleTemplate || roleTemplate.ownerOrgId !== organisationId) {
        reply.code(404).send({ error: "Not found" });
        return;
      }

      const nextVersion = (roleTemplate.requirementSets[0]?.version ?? 0) + 1;
      const requirementSet = await prisma.requirementSet.create({
        data: {
          roleTemplateId: id,
          version: nextVersion,
          status: RequirementSetStatus.DRAFT,
          requirements: {
            create: parsed.data.requirements.map((r, index) => ({
              code: r.code,
              type: r.type,
              hard: r.hard,
              evaluator: r.evaluator,
              parametersJson: r.parameters as Prisma.InputJsonValue | undefined,
              failureMessage: r.failureMessage,
              unknownMessage: r.unknownMessage,
              sortOrder: index,
            })),
          },
        },
        include: { requirements: true },
      });

      await recordAuditEvent(prisma, {
        eventType: "scope.requirementSet.create",
        actorId: request.authUser!.id,
        actingOrgId: organisationId,
        resourceType: "RequirementSet",
        resourceId: requirementSet.id,
        outcome: "success",
      });

      reply.code(201).send(requirementSet);
    },
  );

  app.post(
    "/v1/organisations/:organisationId/role-templates/:id/requirement-sets/:setId/publish",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...AUTHOR_ROLES)] },
    async (request, reply) => {
      const { organisationId, id, setId } = request.params as {
        organisationId: string;
        id: string;
        setId: string;
      };

      const roleTemplate = await prisma.roleTemplate.findUnique({ where: { id } });
      if (!roleTemplate || roleTemplate.ownerOrgId !== organisationId) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      const requirementSet = await prisma.requirementSet.findUnique({ where: { id: setId } });
      if (!requirementSet || requirementSet.roleTemplateId !== id) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      if (requirementSet.status !== RequirementSetStatus.DRAFT) {
        reply.code(409).send({ error: `Requirement set is ${requirementSet.status}, not DRAFT` });
        return;
      }

      const [published] = await prisma.$transaction([
        prisma.requirementSet.update({
          where: { id: setId },
          data: {
            status: RequirementSetStatus.PUBLISHED,
            approvedBy: request.authUser!.id,
            approvedAt: new Date(),
          },
        }),
        // Retiring the previous default keeps "one published requirement
        // set at a time" true, so eligibility always evaluates against an
        // unambiguous current policy version.
        prisma.requirementSet.updateMany({
          where: {
            roleTemplateId: id,
            status: RequirementSetStatus.PUBLISHED,
            id: { not: setId },
          },
          data: { status: RequirementSetStatus.RETIRED, effectiveTo: new Date() },
        }),
        prisma.roleTemplate.update({
          where: { id },
          data: { defaultRequirementSetId: setId, status: "PUBLISHED" },
        }),
      ]);

      await recordAuditEvent(prisma, {
        eventType: "scope.requirementSet.publish",
        actorId: request.authUser!.id,
        actingOrgId: organisationId,
        resourceType: "RequirementSet",
        resourceId: setId,
        outcome: "success",
      });

      reply.send(published);
    },
  );

  // -------------------------------------------------------------------
  // Scope grants — the actual organisation-issued authority. Always
  // created by this organisation for this organisation; never inferred
  // from, or editable by, anyone else (see schema.prisma's top-of-file
  // design invariant).
  // -------------------------------------------------------------------
  app.post(
    "/v1/organisations/:organisationId/scope-grants",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...DECIDE_ROLES)] },
    async (request, reply) => {
      const parsed = issueScopeGrantBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const { organisationId } = request.params as { organisationId: string };
      const { practitionerId, facilityIds, restrictions, ...rest } = parsed.data;

      const practitioner = await prisma.practitioner.findUnique({ where: { id: practitionerId } });
      if (!practitioner) {
        reply.code(400).send({ error: "Unknown practitioner" });
        return;
      }
      const facilities = await prisma.facility.findMany({
        where: { id: { in: facilityIds }, organisationId },
      });
      if (facilities.length !== facilityIds.length) {
        reply.code(400).send({ error: "One or more facilities do not belong to this organisation" });
        return;
      }

      const scopeGrant = await prisma.scopeGrant.create({
        data: {
          practitionerId,
          issuingOrgId: organisationId,
          status: ScopeGrantStatus.ACTIVE,
          restrictionsJson: restrictions as Prisma.InputJsonValue | undefined,
          ...rest,
          facilities: { create: facilityIds.map((facilityId) => ({ facilityId })) },
        },
        include: { facilities: true },
      });

      await recordAuditEvent(prisma, {
        eventType: "scope.grant.issue",
        actorId: request.authUser!.id,
        actingOrgId: organisationId,
        resourceType: "ScopeGrant",
        resourceId: scopeGrant.id,
        outcome: "success",
        metadata: { practitionerId, roleActivityCode: parsed.data.roleActivityCode },
      });

      reply.code(201).send(scopeGrant);
    },
  );

  app.get(
    "/v1/organisations/:organisationId/scope-grants",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...READ_ROLES)] },
    async (request, reply) => {
      const { organisationId } = request.params as { organisationId: string };
      const { practitionerId } = request.query as { practitionerId?: string };
      const scopeGrants = await prisma.scopeGrant.findMany({
        where: { issuingOrgId: organisationId, ...(practitionerId ? { practitionerId } : {}) },
        include: { facilities: true },
      });
      reply.send(scopeGrants);
    },
  );

  async function transitionScopeGrant(
    organisationId: string,
    scopeGrantId: string,
    from: ScopeGrantStatus[],
    to: ScopeGrantStatus,
  ) {
    const existing = await prisma.scopeGrant.findUnique({ where: { id: scopeGrantId } });
    if (!existing || existing.issuingOrgId !== organisationId) return { error: 404 as const };
    if (!from.includes(existing.status)) {
      return { error: 409 as const, detail: `Scope grant is ${existing.status}` };
    }
    const updated = await prisma.scopeGrant.update({
      where: { id: scopeGrantId },
      data: { status: to },
    });
    return { updated };
  }

  app.post(
    "/v1/organisations/:organisationId/scope-grants/:id/suspend",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...DECIDE_ROLES)] },
    async (request, reply) => {
      const { organisationId, id } = request.params as { organisationId: string; id: string };
      const result = await transitionScopeGrant(
        organisationId,
        id,
        [ScopeGrantStatus.ACTIVE],
        ScopeGrantStatus.SUSPENDED,
      );
      if (result.error === 404) return reply.code(404).send({ error: "Not found" });
      if (result.error === 409) return reply.code(409).send({ error: result.detail });

      await recordAuditEvent(prisma, {
        eventType: "scope.grant.suspend",
        actorId: request.authUser!.id,
        actingOrgId: organisationId,
        resourceType: "ScopeGrant",
        resourceId: id,
        outcome: "success",
      });
      reply.send(result.updated);
    },
  );

  app.post(
    "/v1/organisations/:organisationId/scope-grants/:id/withdraw",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...DECIDE_ROLES)] },
    async (request, reply) => {
      const { organisationId, id } = request.params as { organisationId: string; id: string };
      const result = await transitionScopeGrant(
        organisationId,
        id,
        [ScopeGrantStatus.ACTIVE, ScopeGrantStatus.SUSPENDED, ScopeGrantStatus.DRAFT],
        ScopeGrantStatus.WITHDRAWN,
      );
      if (result.error === 404) return reply.code(404).send({ error: "Not found" });
      if (result.error === 409) return reply.code(409).send({ error: result.detail });

      await recordAuditEvent(prisma, {
        eventType: "scope.grant.withdraw",
        actorId: request.authUser!.id,
        actingOrgId: organisationId,
        resourceType: "ScopeGrant",
        resourceId: id,
        outcome: "success",
      });
      reply.send(result.updated);
    },
  );

  // Practitioner's own read-only view across every organisation that has
  // issued them scope — never editable from here (see the design
  // invariant: ScopeGrant is always organisation-issued, never
  // practitioner-editable).
  app.get("/v1/scope/me", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const scopeGrants = await prisma.scopeGrant.findMany({
      where: { practitionerId: request.authUser.practitionerId },
      include: { facilities: { include: { facility: true } }, issuingOrg: true },
    });
    reply.send(
      scopeGrants.map((g) => ({
        id: g.id,
        issuingOrganisation: { id: g.issuingOrg.id, name: g.issuingOrg.name },
        roleActivityCode: g.roleActivityCode,
        status: g.status,
        effectiveFrom: g.effectiveFrom,
        effectiveTo: g.effectiveTo,
        supervisionLevel: g.supervisionLevel,
        facilities: g.facilities.map((f) => ({ id: f.facility.id, name: f.facility.name })),
      })),
    );
  });
}
