import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { OrganisationRole } from "@prisma/client";
import { prisma } from "../../prisma.js";
import { evaluateRequirementSet } from "./evaluators.js";

const STAFF_READ_ROLES: OrganisationRole[] = ["MEDICAL_WORKFORCE", "CREDENTIAL_OFFICER", "SCOPE_APPROVER"];

const evaluateBody = z.object({
  practitionerId: z.string().uuid(),
  requirementSetId: z.string().uuid(),
  asOf: z.coerce.date().optional(),
  window: z
    .object({ startAt: z.coerce.date(), endAt: z.coerce.date() })
    .optional(),
});

export function registerEligibilityRoutes(app: FastifyInstance) {
  // No persisted EligibilityAssessment here — that model ties to a
  // specific Vacancy (modules/exchange, not built yet). This is the
  // deterministic evaluation core on its own: "would practitioner X be
  // eligible against requirement set Y", computed fresh every call.
  app.post("/v1/eligibility/evaluate", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = evaluateBody.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    const { practitionerId, requirementSetId, asOf, window } = parsed.data;

    const requirementSet = await prisma.requirementSet.findUnique({
      where: { id: requirementSetId },
      include: { requirements: { orderBy: { sortOrder: "asc" } }, roleTemplate: true },
    });
    if (!requirementSet) {
      reply.code(404).send({ error: "Not found" });
      return;
    }

    const isSelf = request.authUser!.practitionerId === practitionerId;
    const isAuthorisedStaff = request.authUser!.memberships.some(
      (m) => m.organisationId === requirementSet.roleTemplate.ownerOrgId && STAFF_READ_ROLES.includes(m.role),
    );
    if (!isSelf && !isAuthorisedStaff) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }

    const practitioner = await prisma.practitioner.findUnique({ where: { id: practitionerId } });
    if (!practitioner) {
      reply.code(400).send({ error: "Unknown practitioner" });
      return;
    }

    const { status, assessedAt, results } = await evaluateRequirementSet(
      prisma,
      requirementSet,
      practitionerId,
      { asOf, window },
    );

    reply.send({
      practitionerId,
      requirementSet: {
        id: requirementSet.id,
        version: requirementSet.version,
        status: requirementSet.status,
        roleTemplate: {
          id: requirementSet.roleTemplate.id,
          code: requirementSet.roleTemplate.code,
          name: requirementSet.roleTemplate.name,
        },
      },
      status,
      assessedAt,
      results,
    });
  });
}
