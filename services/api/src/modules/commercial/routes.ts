import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { Prisma, CandidateStatus, AgencyProposalStatus, VacancyStatus } from "@prisma/client";
import { prisma } from "../../prisma.js";
import { recordAuditEvent } from "../audit/index.js";
import { findActiveAgreement } from "./agreements.js";

// Agency panel administration (register/suspend an agency, author its fee
// agreements) is a state-level procurement authority, not tied to any one
// hospital's organisation — same not-org-scoped shape as
// modules/assurance's CREDENTIAL_OFFICER routes.
const PANEL_ADMIN_ROLE = "PROCUREMENT" as const;
// Who, on the hospital/LHN side, can read agency proposals and their
// commercial terms for a vacancy. Matches §25's "Procurement/workforce
// delegated" access note for the Commercial compartment.
const STAFF_COMMERCIAL_READ_ROLES = ["MEDICAL_WORKFORCE", "PROCUREMENT", "FINANCE"] as const;
const WORKFORCE_ROLE = "MEDICAL_WORKFORCE" as const;

const registerAgencyBody = z.object({
  organisationId: z.string().uuid(),
  categories: z.array(z.string().min(1)).optional(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional(),
});

const updateAgencyBody = z
  .object({
    panelStatus: z.enum(["ELIGIBLE", "SUSPENDED", "EXPIRED", "INELIGIBLE"]).optional(),
    categories: z.array(z.string().min(1)).optional(),
    effectiveFrom: z.coerce.date().optional(),
    effectiveTo: z.coerce.date().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "No fields to update" });

const createAgreementBody = z.object({
  category: z.string().min(1).optional(),
  feeModel: z.enum(["PERCENT", "FIXED", "MARKUP", "OTHER"]),
  terms: z.record(z.unknown()),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional(),
});

const submitProposalBody = z.object({
  vacancyId: z.string().uuid(),
  email: z.string().email(),
});

const sourcingExceptionBody = z.object({
  reason: z.string().min(1),
  authority: z.string().min(1).optional(),
  evidence: z.string().min(1).optional(),
});

const createPlacementBody = z.object({
  practitionerId: z.string().uuid(),
  roleTemplateId: z.string().uuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
});

function serializeAgency(agency: {
  id: string;
  organisationId: string;
  panelStatus: string;
  categoriesJson: unknown;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  organisation: { name: string };
}) {
  return {
    id: agency.id,
    organisationId: agency.organisationId,
    organisationName: agency.organisation.name,
    panelStatus: agency.panelStatus,
    categories: agency.categoriesJson,
    effectiveFrom: agency.effectiveFrom,
    effectiveTo: agency.effectiveTo,
  };
}

// An agency's own AGENCY_USER account is never looked up by an org-id URL
// param (unlike every other staff role in this app) — the agency's panel
// membership, not an arbitrary org id the caller could type into the URL,
// is what decides which Agency row they act as.
async function resolveCallerAgency(request: FastifyRequest) {
  const membership = request.authUser?.memberships.find((m) => m.role === "AGENCY_USER");
  if (!membership) return null;
  const agency = await prisma.agency.findUnique({ where: { organisationId: membership.organisationId } });
  return agency;
}

export function registerCommercialRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------
  // Panel administration (PROCUREMENT)
  // -------------------------------------------------------------------
  app.post(
    "/v1/commercial/agencies",
    { preHandler: [app.authenticate, app.requireOrgRole(PANEL_ADMIN_ROLE)] },
    async (request, reply) => {
      const parsed = registerAgencyBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const { organisationId, categories, ...rest } = parsed.data;

      const organisation = await prisma.organisation.findUnique({ where: { id: organisationId } });
      if (!organisation || organisation.type !== "AGENCY") {
        reply.code(400).send({ error: "Organisation must exist and be of type AGENCY" });
        return;
      }

      try {
        const agency = await prisma.agency.create({
          data: { organisationId, categoriesJson: categories, ...rest },
          include: { organisation: true },
        });

        await recordAuditEvent(prisma, {
          eventType: "commercial.agency.register",
          actorId: request.authUser!.id,
          resourceType: "Agency",
          resourceId: agency.id,
          outcome: "success",
        });

        reply.code(201).send(serializeAgency(agency));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          reply.code(409).send({ error: "This organisation is already on the agency panel" });
          return;
        }
        throw err;
      }
    },
  );

  app.get(
    "/v1/commercial/agencies",
    { preHandler: [app.authenticate, app.requireOrgRole(PANEL_ADMIN_ROLE, "FINANCE")] },
    async (_request, reply) => {
      const agencies = await prisma.agency.findMany({
        include: { organisation: true },
        orderBy: { organisation: { name: "asc" } },
      });
      reply.send(agencies.map(serializeAgency));
    },
  );

  app.patch(
    "/v1/commercial/agencies/:id",
    { preHandler: [app.authenticate, app.requireOrgRole(PANEL_ADMIN_ROLE)] },
    async (request, reply) => {
      const parsed = updateAgencyBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const { id } = request.params as { id: string };
      const existing = await prisma.agency.findUnique({ where: { id } });
      if (!existing) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      const { categories, ...rest } = parsed.data;

      const agency = await prisma.agency.update({
        where: { id },
        data: { ...rest, ...(categories ? { categoriesJson: categories } : {}) },
        include: { organisation: true },
      });

      await recordAuditEvent(prisma, {
        eventType: "commercial.agency.update",
        actorId: request.authUser!.id,
        resourceType: "Agency",
        resourceId: agency.id,
        outcome: "success",
        metadata: { panelStatus: agency.panelStatus },
      });

      reply.send(serializeAgency(agency));
    },
  );

  app.post(
    "/v1/commercial/agencies/:id/agreements",
    { preHandler: [app.authenticate, app.requireOrgRole(PANEL_ADMIN_ROLE)] },
    async (request, reply) => {
      const parsed = createAgreementBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const { id } = request.params as { id: string };
      const agency = await prisma.agency.findUnique({ where: { id } });
      if (!agency) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      const { terms, ...rest } = parsed.data;

      const agreement = await prisma.agencyAgreement.create({
        data: { agencyId: id, termsJson: terms as Prisma.InputJsonValue, ...rest },
      });

      await recordAuditEvent(prisma, {
        eventType: "commercial.agreement.create",
        actorId: request.authUser!.id,
        resourceType: "AgencyAgreement",
        resourceId: agreement.id,
        outcome: "success",
        // feeModel/category only — never the terms themselves in the audit
        // trail metadata, which is read more broadly than the commercial
        // compartment itself.
        metadata: { agencyId: id, feeModel: agreement.feeModel, category: agreement.category },
      });

      reply.code(201).send(agreement);
    },
  );

  app.get(
    "/v1/commercial/agencies/:id/agreements",
    { preHandler: [app.authenticate, app.requireOrgRole(PANEL_ADMIN_ROLE, "FINANCE")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const agreements = await prisma.agencyAgreement.findMany({ where: { agencyId: id } });
      reply.send(agreements);
    },
  );

  // -------------------------------------------------------------------
  // Agency-side: browse sourcing-open vacancies, submit/withdraw proposals
  // -------------------------------------------------------------------
  app.get("/v1/commercial/agency/vacancies", { preHandler: app.authenticate }, async (request, reply) => {
    const agency = await resolveCallerAgency(request);
    if (!agency) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    if (agency.panelStatus !== "ELIGIBLE") {
      reply.code(403).send({ error: `This agency's panel status is ${agency.panelStatus}, not ELIGIBLE` });
      return;
    }
    const vacancies = await prisma.vacancy.findMany({
      where: { status: VacancyStatus.SOURCING },
      include: { facility: true, roleTemplate: true, organisation: true },
      orderBy: { startAt: "asc" },
    });
    reply.send(
      vacancies.map((v) => ({
        id: v.id,
        status: v.status,
        startAt: v.startAt,
        endAt: v.endAt,
        deliveryMode: v.deliveryMode,
        organisation: { id: v.organisation.id, name: v.organisation.name },
        facility: { id: v.facility.id, name: v.facility.name },
        roleTemplate: { id: v.roleTemplate.id, code: v.roleTemplate.code, name: v.roleTemplate.name },
      })),
    );
  });

  app.post("/v1/commercial/agency/proposals", { preHandler: app.authenticate }, async (request, reply) => {
    const agency = await resolveCallerAgency(request);
    if (!agency) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const parsed = submitProposalBody.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    if (agency.panelStatus !== "ELIGIBLE") {
      reply.code(403).send({ error: `This agency's panel status is ${agency.panelStatus}, not ELIGIBLE` });
      return;
    }
    const { vacancyId, email } = parsed.data;

    const vacancy = await prisma.vacancy.findUnique({ where: { id: vacancyId } });
    if (!vacancy) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    if (vacancy.status !== VacancyStatus.SOURCING) {
      reply.code(409).send({ error: `Vacancy is not open for candidates (status: ${vacancy.status})` });
      return;
    }

    // A candidate the agency wants to put forward must already be a
    // registered practitioner — representing someone not yet in the
    // system at all (the spec's "represented identity" for an unresolved
    // external candidate) is a documented gap, not built in this slice.
    const practitioner = await prisma.practitioner.findUnique({ where: { email } });
    if (!practitioner) {
      reply.code(404).send({ error: "No registered practitioner with that email" });
      return;
    }

    try {
      const { candidate, proposal } = await prisma.$transaction(async (tx) => {
        const candidate = await tx.candidate.upsert({
          where: { vacancyId_practitionerId: { vacancyId, practitionerId: practitioner.id } },
          create: {
            vacancyId,
            practitionerId: practitioner.id,
            sourceType: "AGENCY",
            sourceId: agency.id,
            status: CandidateStatus.AGENCY_PROPOSED,
          },
          update: { status: CandidateStatus.AGENCY_PROPOSED, sourceType: "AGENCY", sourceId: agency.id },
        });

        const agreement = await findActiveAgreement(tx, agency.id, new Date());
        const proposal = await tx.agencyProposal.create({
          data: {
            agencyId: agency.id,
            candidateId: candidate.id,
            practitionerId: practitioner.id,
            representedIdentityJson: { email: practitioner.email, displayName: practitioner.displayName },
            rateFeeSnapshotJson: agreement
              ? ({ agreementId: agreement.id, feeModel: agreement.feeModel, terms: agreement.termsJson } as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          },
        });
        return { candidate, proposal };
      });

      await recordAuditEvent(prisma, {
        eventType: "commercial.proposal.submit",
        actorId: request.authUser!.id,
        resourceType: "AgencyProposal",
        resourceId: proposal.id,
        outcome: "success",
        metadata: { vacancyId, candidateId: candidate.id },
      });

      reply.code(201).send({
        id: proposal.id,
        candidateId: candidate.id,
        status: proposal.status,
        submittedAt: proposal.submittedAt,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        reply.code(409).send({ error: "A proposal already exists for this candidate" });
        return;
      }
      throw err;
    }
  });

  app.get("/v1/commercial/agency/proposals", { preHandler: app.authenticate }, async (request, reply) => {
    const agency = await resolveCallerAgency(request);
    if (!agency) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const proposals = await prisma.agencyProposal.findMany({
      where: { agencyId: agency.id },
      include: { candidate: { include: { vacancy: { include: { facility: true, roleTemplate: true } } } } },
      orderBy: { submittedAt: "desc" },
    });
    // Never the other agencies' terms — this is already scoped to the
    // caller's own agencyId, but the point is worth keeping explicit here:
    // this is the one list endpoint an agency can call, and it only ever
    // returns rows this agency itself submitted.
    reply.send(
      proposals.map((p) => ({
        id: p.id,
        status: p.status,
        submittedAt: p.submittedAt,
        representedIdentity: p.representedIdentityJson,
        rateFeeSnapshot: p.rateFeeSnapshotJson,
        candidateStatus: p.candidate.status,
        vacancy: {
          id: p.candidate.vacancy.id,
          status: p.candidate.vacancy.status,
          startAt: p.candidate.vacancy.startAt,
          endAt: p.candidate.vacancy.endAt,
          facility: p.candidate.vacancy.facility.name,
          roleTemplate: p.candidate.vacancy.roleTemplate.name,
        },
      })),
    );
  });

  app.post(
    "/v1/commercial/agency/proposals/:id/withdraw",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const agency = await resolveCallerAgency(request);
      if (!agency) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { id } = request.params as { id: string };
      const proposal = await prisma.agencyProposal.findUnique({ where: { id } });
      if (!proposal || proposal.agencyId !== agency.id) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      if (proposal.status !== AgencyProposalStatus.SUBMITTED) {
        reply.code(409).send({ error: `Proposal is ${proposal.status}, not SUBMITTED` });
        return;
      }

      await prisma.$transaction([
        prisma.agencyProposal.update({ where: { id }, data: { status: AgencyProposalStatus.WITHDRAWN } }),
        prisma.candidate.update({ where: { id: proposal.candidateId }, data: { status: CandidateStatus.WITHDRAWN } }),
      ]);

      await recordAuditEvent(prisma, {
        eventType: "commercial.proposal.withdraw",
        actorId: request.authUser!.id,
        resourceType: "AgencyProposal",
        resourceId: id,
        outcome: "success",
      });

      reply.code(204).send();
    },
  );

  // -------------------------------------------------------------------
  // Staff-side: review agency proposals for a vacancy, decline one
  // (accepting happens by assessing + selecting the same candidate
  // through modules/exchange — see that module's select handler, which
  // snapshots the agency's commercial terms onto the resulting Booking)
  // -------------------------------------------------------------------
  app.get(
    "/v1/organisations/:organisationId/vacancies/:id/agency-proposals",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...STAFF_COMMERCIAL_READ_ROLES)] },
    async (request, reply) => {
      const { organisationId, id } = request.params as { organisationId: string; id: string };
      const vacancy = await prisma.vacancy.findUnique({ where: { id } });
      if (!vacancy || vacancy.organisationId !== organisationId) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      const proposals = await prisma.agencyProposal.findMany({
        where: { candidate: { vacancyId: id } },
        include: { agency: { include: { organisation: true } }, candidate: true },
        orderBy: { submittedAt: "asc" },
      });
      reply.send(
        proposals.map((p) => ({
          id: p.id,
          status: p.status,
          submittedAt: p.submittedAt,
          candidateId: p.candidateId,
          candidateStatus: p.candidate.status,
          agencyName: p.agency.organisation.name,
          representedIdentity: p.representedIdentityJson,
          rateFeeSnapshot: p.rateFeeSnapshotJson,
        })),
      );
    },
  );

  app.post(
    "/v1/organisations/:organisationId/vacancies/:id/agency-proposals/:proposalId/decline",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", WORKFORCE_ROLE)] },
    async (request, reply) => {
      const { organisationId, id, proposalId } = request.params as {
        organisationId: string;
        id: string;
        proposalId: string;
      };
      const vacancy = await prisma.vacancy.findUnique({ where: { id } });
      if (!vacancy || vacancy.organisationId !== organisationId) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      const proposal = await prisma.agencyProposal.findUnique({ where: { id: proposalId } });
      if (!proposal) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      const candidate = await prisma.candidate.findUnique({ where: { id: proposal.candidateId } });
      if (!candidate || candidate.vacancyId !== id) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      if (proposal.status !== AgencyProposalStatus.SUBMITTED) {
        reply.code(409).send({ error: `Proposal is ${proposal.status}, not SUBMITTED` });
        return;
      }

      await prisma.$transaction([
        prisma.agencyProposal.update({ where: { id: proposalId }, data: { status: AgencyProposalStatus.DECLINED } }),
        prisma.candidate.update({ where: { id: proposal.candidateId }, data: { status: CandidateStatus.DECLINED } }),
      ]);

      await recordAuditEvent(prisma, {
        eventType: "commercial.proposal.decline",
        actorId: request.authUser!.id,
        actingOrgId: organisationId,
        resourceType: "AgencyProposal",
        resourceId: proposalId,
        outcome: "success",
      });

      reply.code(204).send();
    },
  );

  // -------------------------------------------------------------------
  // Sourcing exceptions (PROCUREMENT, org-scoped to the vacancy's org)
  // -------------------------------------------------------------------
  app.post(
    "/v1/organisations/:organisationId/vacancies/:id/sourcing-exceptions",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", PANEL_ADMIN_ROLE)] },
    async (request, reply) => {
      const parsed = sourcingExceptionBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const { organisationId, id } = request.params as { organisationId: string; id: string };
      const vacancy = await prisma.vacancy.findUnique({ where: { id } });
      if (!vacancy || vacancy.organisationId !== organisationId) {
        reply.code(404).send({ error: "Not found" });
        return;
      }

      const exception = await prisma.sourcingException.create({
        data: { vacancyId: id, approvedBy: request.authUser!.id, ...parsed.data },
      });

      await recordAuditEvent(prisma, {
        eventType: "commercial.sourcing-exception.record",
        actorId: request.authUser!.id,
        actingOrgId: organisationId,
        resourceType: "SourcingException",
        resourceId: exception.id,
        outcome: "success",
        metadata: { vacancyId: id, reason: exception.reason },
      });

      reply.code(201).send(exception);
    },
  );

  app.get(
    "/v1/organisations/:organisationId/vacancies/:id/sourcing-exceptions",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...STAFF_COMMERCIAL_READ_ROLES)] },
    async (request, reply) => {
      const { organisationId, id } = request.params as { organisationId: string; id: string };
      const vacancy = await prisma.vacancy.findUnique({ where: { id } });
      if (!vacancy || vacancy.organisationId !== organisationId) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      const exceptions = await prisma.sourcingException.findMany({
        where: { vacancyId: id },
        orderBy: { createdAt: "desc" },
      });
      reply.send(exceptions);
    },
  );

  // -------------------------------------------------------------------
  // Placements (v0.3 addendum §3 — the aggregate above Booking for
  // non-contiguous block/on-call engagements)
  // -------------------------------------------------------------------
  app.post(
    "/v1/organisations/:organisationId/placements",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", WORKFORCE_ROLE)] },
    async (request, reply) => {
      const parsed = createPlacementBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const { organisationId } = request.params as { organisationId: string };
      const { roleTemplateId, practitionerId, ...rest } = parsed.data;

      const roleTemplate = await prisma.roleTemplate.findUnique({ where: { id: roleTemplateId } });
      if (!roleTemplate || roleTemplate.ownerOrgId !== organisationId) {
        reply.code(400).send({ error: "Unknown role template for this organisation" });
        return;
      }
      const practitioner = await prisma.practitioner.findUnique({ where: { id: practitionerId } });
      if (!practitioner) {
        reply.code(400).send({ error: "Unknown practitioner" });
        return;
      }

      const placement = await prisma.placement.create({
        data: { organisationId, roleTemplateId, practitionerId, ...rest },
      });

      await recordAuditEvent(prisma, {
        eventType: "commercial.placement.create",
        actorId: request.authUser!.id,
        actingOrgId: organisationId,
        resourceType: "Placement",
        resourceId: placement.id,
        outcome: "success",
      });

      reply.code(201).send(placement);
    },
  );

  app.get(
    "/v1/organisations/:organisationId/placements",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...STAFF_COMMERCIAL_READ_ROLES)] },
    async (request, reply) => {
      const { organisationId } = request.params as { organisationId: string };
      const placements = await prisma.placement.findMany({
        where: { organisationId },
        include: { practitioner: true, bookings: true },
        orderBy: { startDate: "desc" },
      });
      reply.send(
        placements.map((p) => ({
          id: p.id,
          status: p.status,
          startDate: p.startDate,
          endDate: p.endDate,
          roleTemplateId: p.roleTemplateId,
          practitioner: { id: p.practitioner.id, displayName: p.practitioner.displayName, email: p.practitioner.email },
          bookingCount: p.bookings.length,
        })),
      );
    },
  );

  app.get(
    "/v1/organisations/:organisationId/placements/:id",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...STAFF_COMMERCIAL_READ_ROLES)] },
    async (request, reply) => {
      const { organisationId, id } = request.params as { organisationId: string; id: string };
      const placement = await prisma.placement.findUnique({
        where: { id },
        include: { practitioner: true, bookings: { include: { vacancy: true } } },
      });
      if (!placement || placement.organisationId !== organisationId) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      reply.send({
        id: placement.id,
        status: placement.status,
        startDate: placement.startDate,
        endDate: placement.endDate,
        roleTemplateId: placement.roleTemplateId,
        practitioner: {
          id: placement.practitioner.id,
          displayName: placement.practitioner.displayName,
          email: placement.practitioner.email,
        },
        bookings: placement.bookings.map((b) => ({
          id: b.id,
          status: b.status,
          vacancyId: b.vacancyId,
          startAt: b.vacancy.startAt,
          endAt: b.vacancy.endAt,
        })),
      });
    },
  );
}
