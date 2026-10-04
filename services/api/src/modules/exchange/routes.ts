import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma, CandidateStatus, VacancyStatus, BookingStatus, CandidateSourceType, AgencyProposalStatus } from "@prisma/client";
import { prisma } from "../../prisma.js";
import { recordAuditEvent } from "../audit/index.js";
import { evaluateRequirementSet } from "../eligibility/evaluators.js";
import { findActiveAgreement } from "../commercial/agreements.js";

// Matches the spec's Medical Workforce persona: "Vacancies, sourcing,
// candidate review, booking" (§3). Read access is a bit broader (shared
// with modules/scope's READ_ROLES) since credentialling/scope staff also
// need visibility into what a candidate is being assessed against.
const WORKFORCE_ROLE = "MEDICAL_WORKFORCE" as const;
const READ_ROLES = ["MEDICAL_WORKFORCE", "CREDENTIAL_OFFICER", "SCOPE_APPROVER"] as const;

const selectCandidateBody = z.object({
  // Links the resulting Booking to an existing Placement (v0.3 addendum
  // §3 — the aggregate above Booking for non-contiguous block/on-call
  // engagements), e.g. one leg of a "1 week per month for 6 months" rural
  // generalist arrangement. Optional — most bookings aren't part of one.
  placementId: z.string().uuid().optional(),
});

const createVacancyBody = z.object({
  roleTemplateId: z.string().uuid(),
  facilityId: z.string().uuid(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  deliveryMode: z.enum(["IN_PERSON", "TELEHEALTH_SYNCHRONOUS", "HYBRID"]).optional(),
  reasonCode: z.string().min(1).optional(),
});

function serializeVacancy(v: {
  id: string;
  status: VacancyStatus;
  startAt: Date;
  endAt: Date;
  deliveryMode: string;
  reasonCode: string | null;
  facility: { id: string; name: string };
  roleTemplate: { id: string; code: string; name: string; defaultRequirementSetId: string | null };
  organisation: { id: string; name: string };
}) {
  return {
    id: v.id,
    status: v.status,
    startAt: v.startAt,
    endAt: v.endAt,
    deliveryMode: v.deliveryMode,
    reasonCode: v.reasonCode,
    facility: v.facility,
    roleTemplate: { id: v.roleTemplate.id, code: v.roleTemplate.code, name: v.roleTemplate.name },
    organisation: v.organisation,
  };
}

const VACANCY_INCLUDE = {
  facility: true,
  roleTemplate: true,
  organisation: true,
} as const;

export function registerExchangeRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------
  // Staff: create, approve, open for candidates
  // -------------------------------------------------------------------
  app.post(
    "/v1/organisations/:organisationId/vacancies",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", WORKFORCE_ROLE)] },
    async (request, reply) => {
      const parsed = createVacancyBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const { organisationId } = request.params as { organisationId: string };
      const { roleTemplateId, facilityId, ...rest } = parsed.data;

      const roleTemplate = await prisma.roleTemplate.findUnique({ where: { id: roleTemplateId } });
      if (!roleTemplate || roleTemplate.ownerOrgId !== organisationId) {
        reply.code(400).send({ error: "Unknown role template for this organisation" });
        return;
      }
      if (!roleTemplate.defaultRequirementSetId) {
        reply.code(409).send({ error: "Role template has no published requirement set yet" });
        return;
      }
      const facility = await prisma.facility.findUnique({ where: { id: facilityId } });
      if (!facility || facility.organisationId !== organisationId) {
        reply.code(400).send({ error: "Unknown facility for this organisation" });
        return;
      }

      const vacancy = await prisma.vacancy.create({
        data: { organisationId, facilityId, roleTemplateId, ...rest, status: VacancyStatus.DRAFT },
        include: VACANCY_INCLUDE,
      });

      await recordAuditEvent(prisma, {
        eventType: "exchange.vacancy.create",
        actorId: request.authUser!.id,
        actingOrgId: organisationId,
        resourceType: "Vacancy",
        resourceId: vacancy.id,
        outcome: "success",
      });

      reply.code(201).send(serializeVacancy(vacancy));
    },
  );

  async function transitionVacancy(
    organisationId: string,
    vacancyId: string,
    from: VacancyStatus[],
    to: VacancyStatus,
    extra: Record<string, unknown> = {},
  ) {
    const existing = await prisma.vacancy.findUnique({ where: { id: vacancyId } });
    if (!existing || existing.organisationId !== organisationId) return { error: 404 as const };
    if (!from.includes(existing.status)) {
      return { error: 409 as const, detail: `Vacancy is ${existing.status}, expected one of ${from.join(", ")}` };
    }
    const updated = await prisma.vacancy.update({
      where: { id: vacancyId },
      data: { status: to, ...extra },
      include: VACANCY_INCLUDE,
    });
    return { updated };
  }

  app.post(
    "/v1/organisations/:organisationId/vacancies/:id/approve",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", WORKFORCE_ROLE)] },
    async (request, reply) => {
      const { organisationId, id } = request.params as { organisationId: string; id: string };
      const result = await transitionVacancy(organisationId, id, [VacancyStatus.DRAFT], VacancyStatus.APPROVED, {
        approvedBy: request.authUser!.id,
        approvedAt: new Date(),
      });
      if (result.error === 404) return reply.code(404).send({ error: "Not found" });
      if (result.error === 409) return reply.code(409).send({ error: result.detail });
      reply.send(serializeVacancy(result.updated));
    },
  );

  app.post(
    "/v1/organisations/:organisationId/vacancies/:id/open-for-candidates",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", WORKFORCE_ROLE)] },
    async (request, reply) => {
      const { organisationId, id } = request.params as { organisationId: string; id: string };
      const result = await transitionVacancy(organisationId, id, [VacancyStatus.APPROVED], VacancyStatus.SOURCING);
      if (result.error === 404) return reply.code(404).send({ error: "Not found" });
      if (result.error === 409) return reply.code(409).send({ error: result.detail });
      reply.send(serializeVacancy(result.updated));
    },
  );

  app.get(
    "/v1/organisations/:organisationId/vacancies",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...READ_ROLES)] },
    async (request, reply) => {
      const { organisationId } = request.params as { organisationId: string };
      const vacancies = await prisma.vacancy.findMany({
        where: { organisationId },
        include: VACANCY_INCLUDE,
        orderBy: { createdAt: "desc" },
      });
      reply.send(vacancies.map(serializeVacancy));
    },
  );

  app.get(
    "/v1/organisations/:organisationId/vacancies/:id",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...READ_ROLES)] },
    async (request, reply) => {
      const { organisationId, id } = request.params as { organisationId: string; id: string };
      const vacancy = await prisma.vacancy.findUnique({ where: { id }, include: VACANCY_INCLUDE });
      if (!vacancy || vacancy.organisationId !== organisationId) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      reply.send(serializeVacancy(vacancy));
    },
  );

  // -------------------------------------------------------------------
  // Practitioner-facing: browse open vacancies, apply
  // -------------------------------------------------------------------
  app.get("/v1/vacancies/open", { preHandler: app.authenticate }, async (_request, reply) => {
    const vacancies = await prisma.vacancy.findMany({
      where: { status: VacancyStatus.SOURCING },
      include: VACANCY_INCLUDE,
      orderBy: { startAt: "asc" },
    });
    reply.send(vacancies.map(serializeVacancy));
  });

  app.post("/v1/vacancies/:id/apply", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const { id } = request.params as { id: string };
    const vacancy = await prisma.vacancy.findUnique({ where: { id } });
    if (!vacancy) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    if (vacancy.status !== VacancyStatus.SOURCING) {
      reply.code(409).send({ error: `Vacancy is not open for candidates (status: ${vacancy.status})` });
      return;
    }

    const practitionerId = request.authUser.practitionerId;
    const candidate = await prisma.candidate.upsert({
      where: { vacancyId_practitionerId: { vacancyId: id, practitionerId } },
      create: {
        vacancyId: id,
        practitionerId,
        sourceType: CandidateSourceType.DIRECT,
        status: CandidateStatus.APPLIED,
        interestAt: new Date(),
      },
      update: { status: CandidateStatus.APPLIED, interestAt: new Date() },
    });

    await recordAuditEvent(prisma, {
      eventType: "exchange.candidate.apply",
      actorId: request.authUser.id,
      resourceType: "Candidate",
      resourceId: candidate.id,
      outcome: "success",
    });

    reply.code(201).send(candidate);
  });

  // -------------------------------------------------------------------
  // Staff: review candidates, assess eligibility, select
  // -------------------------------------------------------------------
  app.get(
    "/v1/organisations/:organisationId/vacancies/:id/candidates",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...READ_ROLES)] },
    async (request, reply) => {
      const { organisationId, id } = request.params as { organisationId: string; id: string };
      const vacancy = await prisma.vacancy.findUnique({ where: { id } });
      if (!vacancy || vacancy.organisationId !== organisationId) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      const candidates = await prisma.candidate.findMany({
        where: { vacancyId: id },
        include: {
          practitioner: true,
          eligibilityAssessments: { orderBy: { assessedAt: "desc" }, take: 1 },
        },
        orderBy: { firstVisibleAt: "asc" },
      });
      reply.send(
        candidates.map((c) => ({
          id: c.id,
          status: c.status,
          sourceType: c.sourceType,
          practitioner: { id: c.practitioner.id, displayName: c.practitioner.displayName, email: c.practitioner.email },
          interestAt: c.interestAt,
          latestAssessment: c.eligibilityAssessments[0]
            ? { status: c.eligibilityAssessments[0].status, assessedAt: c.eligibilityAssessments[0].assessedAt }
            : null,
        })),
      );
    },
  );

  app.post(
    "/v1/organisations/:organisationId/vacancies/:id/candidates/:candidateId/assess",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...READ_ROLES)] },
    async (request, reply) => {
      const { organisationId, id, candidateId } = request.params as {
        organisationId: string;
        id: string;
        candidateId: string;
      };

      const vacancy = await prisma.vacancy.findUnique({ where: { id }, include: { roleTemplate: true } });
      if (!vacancy || vacancy.organisationId !== organisationId) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
      if (!candidate || candidate.vacancyId !== id) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      if (!vacancy.roleTemplate.defaultRequirementSetId) {
        reply.code(409).send({ error: "Role template has no published requirement set" });
        return;
      }

      const requirementSet = await prisma.requirementSet.findUniqueOrThrow({
        where: { id: vacancy.roleTemplate.defaultRequirementSetId },
        include: { requirements: { orderBy: { sortOrder: "asc" } } },
      });

      const { status, assessedAt, results } = await evaluateRequirementSet(
        prisma,
        requirementSet,
        candidate.practitionerId,
        { window: { startAt: vacancy.startAt, endAt: vacancy.endAt } },
      );

      const assessment = await prisma.eligibilityAssessment.create({
        data: {
          candidateId: candidate.id,
          practitionerId: candidate.practitionerId,
          vacancyId: vacancy.id,
          requirementSetId: requirementSet.id,
          requirementSetVersion: requirementSet.version,
          status,
          assessedAt,
          engineVersion: "1",
          results: {
            create: results.map((r) => ({
              requirementId: r.requirementId,
              status: r.status,
              explanation: r.explanation,
            })),
          },
        },
        include: { results: true },
      });

      // INDETERMINATE maps to ELIGIBILITY_PENDING: we don't yet know, so
      // the candidate isn't silently treated as either eligible or
      // ineligible — a human still needs to resolve the underlying gap
      // (e.g. get a credential verified) before this candidate can move.
      const candidateStatus =
        status === "ELIGIBLE"
          ? CandidateStatus.ELIGIBLE
          : status === "INELIGIBLE"
            ? CandidateStatus.INELIGIBLE
            : CandidateStatus.ELIGIBILITY_PENDING;
      await prisma.candidate.update({ where: { id: candidateId }, data: { status: candidateStatus } });

      await recordAuditEvent(prisma, {
        eventType: "exchange.candidate.assess",
        actorId: request.authUser!.id,
        actingOrgId: organisationId,
        resourceType: "EligibilityAssessment",
        resourceId: assessment.id,
        outcome: "success",
        metadata: { candidateId, status },
      });

      reply.code(201).send({
        id: assessment.id,
        status: assessment.status,
        assessedAt: assessment.assessedAt,
        results: assessment.results,
      });
    },
  );

  app.post(
    "/v1/organisations/:organisationId/vacancies/:id/candidates/:candidateId/select",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", WORKFORCE_ROLE)] },
    async (request, reply) => {
      const { organisationId, id, candidateId } = request.params as {
        organisationId: string;
        id: string;
        candidateId: string;
      };

      const vacancy = await prisma.vacancy.findUnique({ where: { id } });
      if (!vacancy || vacancy.organisationId !== organisationId) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      const candidate = await prisma.candidate.findUnique({
        where: { id: candidateId },
        include: { eligibilityAssessments: { orderBy: { assessedAt: "desc" }, take: 1 } },
      });
      if (!candidate || candidate.vacancyId !== id) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      const latestAssessment = candidate.eligibilityAssessments[0];
      if (!latestAssessment || latestAssessment.status !== "ELIGIBLE") {
        reply.code(409).send({
          error: "Candidate has not been assessed as ELIGIBLE — never select without a current ELIGIBLE assessment",
        });
        return;
      }

      const bodyParsed = selectCandidateBody.safeParse(request.body ?? {});
      if (!bodyParsed.success) {
        reply.code(400).send({ error: "Invalid request", details: bodyParsed.error.flatten() });
        return;
      }
      const { placementId } = bodyParsed.data;
      if (placementId) {
        const placement = await prisma.placement.findUnique({ where: { id: placementId } });
        if (!placement || placement.organisationId !== organisationId || placement.practitionerId !== candidate.practitionerId) {
          reply.code(400).send({ error: "Unknown placement for this organisation and practitioner" });
          return;
        }
      }

      const booking = await prisma.$transaction(async (tx) => {
        await tx.candidate.update({ where: { id: candidateId }, data: { status: CandidateStatus.SELECTED } });
        await tx.vacancy.update({ where: { id }, data: { status: VacancyStatus.CANDIDATE_SELECTED } });

        // The engagement is happening right now — this is the one moment
        // the spec requires commercial terms to be frozen onto the
        // booking (never a live reference to the agency's current
        // agreement, which could change later). See modules/commercial's
        // doc comment.
        let commercialSnapshot: Prisma.InputJsonValue | undefined;
        if (candidate.sourceType === CandidateSourceType.AGENCY) {
          const proposal = await tx.agencyProposal.findUnique({ where: { candidateId: candidate.id } });
          if (proposal && proposal.status === AgencyProposalStatus.SUBMITTED) {
            const agreement = await findActiveAgreement(tx, proposal.agencyId, new Date());
            commercialSnapshot = {
              agencyId: proposal.agencyId,
              agreementId: agreement?.id ?? null,
              feeModel: agreement?.feeModel ?? null,
              terms: (agreement?.termsJson as Prisma.InputJsonValue | null) ?? null,
              snapshottedAt: new Date().toISOString(),
            };
            await tx.agencyProposal.update({ where: { id: proposal.id }, data: { status: AgencyProposalStatus.ACCEPTED } });
          }
        }

        return tx.booking.create({
          data: {
            vacancyId: id,
            practitionerId: candidate.practitionerId,
            sourceType: candidate.sourceType,
            status: BookingStatus.PENDING_CONFIRMATION,
            eligibilityAssessmentId: latestAssessment.id,
            commercialSnapshotJson: commercialSnapshot,
            placementId,
          },
        });
      });

      await recordAuditEvent(prisma, {
        eventType: "exchange.candidate.select",
        actorId: request.authUser!.id,
        actingOrgId: organisationId,
        resourceType: "Booking",
        resourceId: booking.id,
        outcome: "success",
        metadata: { candidateId },
      });

      reply.code(201).send(booking);
    },
  );

  // -------------------------------------------------------------------
  // Practitioner-facing: view and confirm own bookings
  // -------------------------------------------------------------------
  app.get("/v1/bookings/me", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const bookings = await prisma.booking.findMany({
      where: { practitionerId: request.authUser.practitionerId },
      include: { vacancy: { include: VACANCY_INCLUDE } },
      orderBy: { vacancy: { startAt: "asc" } },
    });
    reply.send(
      bookings.map((b) => ({
        id: b.id,
        status: b.status,
        confirmedAt: b.confirmedAt,
        vacancy: serializeVacancy(b.vacancy),
      })),
    );
  });

  app.post("/v1/bookings/:id/confirm", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking || booking.practitionerId !== request.authUser?.practitionerId) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    if (booking.status !== BookingStatus.PENDING_CONFIRMATION) {
      reply.code(409).send({ error: `Booking is ${booking.status}, not PENDING_CONFIRMATION` });
      return;
    }

    const [updated] = await prisma.$transaction([
      prisma.booking.update({
        where: { id },
        data: { status: BookingStatus.CONFIRMED, confirmedAt: new Date() },
      }),
      prisma.vacancy.update({ where: { id: booking.vacancyId }, data: { status: VacancyStatus.BOOKED } }),
    ]);

    await recordAuditEvent(prisma, {
      eventType: "exchange.booking.confirm",
      actorId: request.authUser!.id,
      resourceType: "Booking",
      resourceId: id,
      outcome: "success",
    });

    reply.send(updated);
  });
}
