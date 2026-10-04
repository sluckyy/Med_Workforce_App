import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma, BookingStatus, VacancyStatus, TimesheetStatus, TokenStatus } from "@prisma/client";
import { prisma } from "../../prisma.js";
import { recordAuditEvent } from "../audit/index.js";
import { generateApprovalToken, hashApprovalToken } from "./tokens.js";

const WORKFORCE_ROLE = "MEDICAL_WORKFORCE" as const;
const FINANCE_ROLE = "FINANCE" as const;
const STAFF_READ_ROLES = ["MEDICAL_WORKFORCE", "FINANCE"] as const;

const DEFAULT_APPROVAL_TTL_DAYS = 7;

const claimBody = z.object({
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  breakMinutes: z.number().int().min(0).default(0),
  allowances: z.record(z.unknown()).optional(),
  comment: z.string().min(1).optional(),
});

const sendForApprovalBody = z.object({
  recipient: z.string().min(1).optional(),
  expiresInDays: z.number().int().min(1).max(30).default(DEFAULT_APPROVAL_TTL_DAYS),
});

const decisionBody = z
  .object({
    decision: z.enum(["APPROVE", "AMEND", "REJECT"]),
    reason: z.string().min(1).optional(),
    amendedVersion: claimBody.omit({ comment: true }).optional(),
  })
  .refine((b) => b.decision !== "REJECT" || !!b.reason, { message: "reason is required to reject" })
  .refine((b) => b.decision !== "AMEND" || !!b.amendedVersion, { message: "amendedVersion is required to amend" });

const reconcileBody = z.object({
  reconciliationRef: z.string().min(1),
});

const TIMESHEET_INCLUDE = {
  booking: {
    include: {
      vacancy: { include: { facility: true, roleTemplate: true, organisation: true } },
      practitioner: true,
    },
  },
  versions: { orderBy: { version: "asc" as const } },
  // Most recently decided token first (nulls — i.e. still-active, never
  // decided tokens — sorted last) so "the latest decision" below actually
  // means the latest decision, not just whichever token happens to expire
  // furthest in the future.
  approvalTokens: { orderBy: { decidedAt: { sort: "desc" as const, nulls: "last" as const } }, take: 1 },
} satisfies Prisma.TimesheetInclude;

type TimesheetWithIncludes = Prisma.TimesheetGetPayload<{ include: typeof TIMESHEET_INCLUDE }>;

function serializeTimesheet(t: TimesheetWithIncludes) {
  const latestToken = t.approvalTokens[0] ?? null;
  return {
    id: t.id,
    status: t.status,
    currentVersion: t.currentVersion,
    submittedAt: t.submittedAt,
    approvedAt: t.approvedAt,
    reconciliationRef: t.reconciliationRef,
    // The most recent approval decision's reason — present for AMENDED
    // and REJECTED so the doctor knows why, not just that something
    // happened. Never the token itself.
    latestDecision: latestToken?.decidedAt ? { reason: latestToken.decisionReason, decidedAt: latestToken.decidedAt } : null,
    booking: {
      id: t.booking.id,
      status: t.booking.status,
      practitioner: { id: t.booking.practitioner.id, displayName: t.booking.practitioner.displayName },
      // The booked shift snapshot, shown alongside the doctor's claimed
      // hours below so any discrepancy is visible to staff/approver.
      bookedStartAt: t.booking.vacancy.startAt,
      bookedEndAt: t.booking.vacancy.endAt,
      facility: t.booking.vacancy.facility.name,
      roleTemplate: t.booking.vacancy.roleTemplate.name,
      organisation: { id: t.booking.vacancy.organisation.id, name: t.booking.vacancy.organisation.name },
    },
    versions: t.versions.map((v) => ({
      id: v.id,
      version: v.version,
      startAt: v.startAt,
      endAt: v.endAt,
      breakMinutes: v.breakMinutes,
      allowances: v.allowancesJson,
      doctorComment: v.doctorComment,
      createdAt: v.createdAt,
    })),
  };
}

async function loadTimesheetOrNull(id: string) {
  return prisma.timesheet.findUnique({ where: { id }, include: TIMESHEET_INCLUDE });
}

export function registerTimesheetRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------
  // Doctor-facing: create, edit while DRAFT, submit, resubmit, accept
  // -------------------------------------------------------------------
  app.post("/v1/bookings/:id/timesheet", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const parsed = claimBody.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    const { id } = request.params as { id: string };

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking || booking.practitionerId !== request.authUser.practitionerId) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      reply.code(409).send({ error: `Booking is ${booking.status}, not CONFIRMED` });
      return;
    }

    const { allowances, comment, ...claim } = parsed.data;
    try {
      const timesheet = await prisma.timesheet.create({
        data: {
          bookingId: id,
          versions: {
            create: { version: 1, ...claim, allowancesJson: allowances as Prisma.InputJsonValue | undefined, doctorComment: comment, createdBy: request.authUser.id },
          },
        },
        include: TIMESHEET_INCLUDE,
      });

      await recordAuditEvent(prisma, {
        eventType: "timesheet.create",
        actorId: request.authUser.id,
        resourceType: "Timesheet",
        resourceId: timesheet.id,
        outcome: "success",
      });

      reply.code(201).send(serializeTimesheet(timesheet));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        reply.code(409).send({ error: "A timesheet already exists for this booking" });
        return;
      }
      throw err;
    }
  });

  app.get("/v1/bookings/:id/timesheet", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const { id } = request.params as { id: string };
    const timesheet = await prisma.timesheet.findUnique({ where: { bookingId: id }, include: TIMESHEET_INCLUDE });
    if (!timesheet || timesheet.booking.practitionerId !== request.authUser.practitionerId) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    reply.send(serializeTimesheet(timesheet));
  });

  function requireOwnDraftLike(
    timesheet: TimesheetWithIncludes,
    practitionerId: string,
    allowedStatuses: TimesheetStatus[],
  ): string | null {
    if (timesheet.booking.practitionerId !== practitionerId) return "not_found";
    if (!allowedStatuses.includes(timesheet.status)) return "wrong_status";
    return null;
  }

  app.patch("/v1/timesheets/:id", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const parsed = claimBody.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    const { id } = request.params as { id: string };
    const timesheet = await loadTimesheetOrNull(id);
    if (!timesheet) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    const problem = requireOwnDraftLike(timesheet, request.authUser.practitionerId, [TimesheetStatus.DRAFT]);
    if (problem === "not_found") {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    if (problem === "wrong_status") {
      reply.code(409).send({ error: `Timesheet is ${timesheet.status}, not DRAFT` });
      return;
    }

    const { allowances, comment, ...claim } = parsed.data;
    await prisma.timesheetVersion.update({
      where: { timesheetId_version: { timesheetId: id, version: timesheet.currentVersion } },
      data: { ...claim, allowancesJson: allowances as Prisma.InputJsonValue | undefined, doctorComment: comment },
    });

    const updated = await loadTimesheetOrNull(id);
    reply.send(serializeTimesheet(updated!));
  });

  app.post("/v1/timesheets/:id/submit", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const { id } = request.params as { id: string };
    const timesheet = await loadTimesheetOrNull(id);
    if (!timesheet) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    const problem = requireOwnDraftLike(timesheet, request.authUser.practitionerId, [TimesheetStatus.DRAFT]);
    if (problem === "not_found") {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    if (problem === "wrong_status") {
      reply.code(409).send({ error: `Timesheet is ${timesheet.status}, not DRAFT` });
      return;
    }

    await prisma.$transaction([
      prisma.timesheet.update({ where: { id }, data: { status: TimesheetStatus.SUBMITTED, submittedAt: new Date() } }),
      prisma.booking.update({ where: { id: timesheet.booking.id }, data: { status: BookingStatus.WORKED } }),
      prisma.vacancy.update({ where: { id: timesheet.booking.vacancy.id }, data: { status: VacancyStatus.TIMESHEET_PENDING } }),
    ]);

    await recordAuditEvent(prisma, {
      eventType: "timesheet.submit",
      actorId: request.authUser.id,
      resourceType: "Timesheet",
      resourceId: id,
      outcome: "success",
    });

    const updated = await loadTimesheetOrNull(id);
    reply.send(serializeTimesheet(updated!));
  });

  // Covers both "the approver amended it and I'm submitting a correction"
  // and "it was rejected and I'm trying again" — either way a fresh claim
  // becomes a new version and the cycle restarts from SUBMITTED.
  app.post("/v1/timesheets/:id/resubmit", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const parsed = claimBody.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    const { id } = request.params as { id: string };
    const timesheet = await loadTimesheetOrNull(id);
    if (!timesheet) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    const problem = requireOwnDraftLike(timesheet, request.authUser.practitionerId, [
      TimesheetStatus.AMENDED,
      TimesheetStatus.REJECTED,
    ]);
    if (problem === "not_found") {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    if (problem === "wrong_status") {
      reply.code(409).send({ error: `Timesheet is ${timesheet.status}, not AMENDED or REJECTED` });
      return;
    }

    const { allowances, comment, ...claim } = parsed.data;
    const nextVersion = timesheet.currentVersion + 1;
    await prisma.$transaction([
      prisma.timesheetVersion.create({
        data: {
          timesheetId: id,
          version: nextVersion,
          ...claim,
          allowancesJson: allowances as Prisma.InputJsonValue | undefined,
          doctorComment: comment,
          createdBy: request.authUser.id,
        },
      }),
      prisma.timesheet.update({
        where: { id },
        data: { status: TimesheetStatus.SUBMITTED, currentVersion: nextVersion, submittedAt: new Date() },
      }),
    ]);

    await recordAuditEvent(prisma, {
      eventType: "timesheet.resubmit",
      actorId: request.authUser.id,
      resourceType: "Timesheet",
      resourceId: id,
      outcome: "success",
      metadata: { version: nextVersion },
    });

    const updated = await loadTimesheetOrNull(id);
    reply.send(serializeTimesheet(updated!));
  });

  // The approver proposed different hours (AMENDED); the doctor can just
  // accept those instead of contesting them, which closes the booking the
  // same way an outright APPROVE decision would.
  app.post("/v1/timesheets/:id/accept-amendment", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const { id } = request.params as { id: string };
    const timesheet = await loadTimesheetOrNull(id);
    if (!timesheet) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    const problem = requireOwnDraftLike(timesheet, request.authUser.practitionerId, [TimesheetStatus.AMENDED]);
    if (problem === "not_found") {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    if (problem === "wrong_status") {
      reply.code(409).send({ error: `Timesheet is ${timesheet.status}, not AMENDED` });
      return;
    }

    await prisma.$transaction([
      prisma.timesheet.update({ where: { id }, data: { status: TimesheetStatus.APPROVED, approvedAt: new Date() } }),
      prisma.booking.update({ where: { id: timesheet.booking.id }, data: { status: BookingStatus.CLOSED } }),
      prisma.vacancy.update({ where: { id: timesheet.booking.vacancy.id }, data: { status: VacancyStatus.COMPLETE } }),
    ]);

    await recordAuditEvent(prisma, {
      eventType: "timesheet.accept-amendment",
      actorId: request.authUser.id,
      resourceType: "Timesheet",
      resourceId: id,
      outcome: "success",
    });

    const updated = await loadTimesheetOrNull(id);
    reply.send(serializeTimesheet(updated!));
  });

  // -------------------------------------------------------------------
  // Staff-facing: review, send for approval, reconcile
  // -------------------------------------------------------------------
  app.get(
    "/v1/organisations/:organisationId/timesheets",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...STAFF_READ_ROLES)] },
    async (request, reply) => {
      const { organisationId } = request.params as { organisationId: string };
      const { status } = request.query as { status?: string };
      const timesheets = await prisma.timesheet.findMany({
        where: {
          booking: { vacancy: { organisationId } },
          ...(status ? { status: status as TimesheetStatus } : {}),
        },
        include: TIMESHEET_INCLUDE,
        orderBy: { submittedAt: "desc" },
      });
      reply.send(timesheets.map(serializeTimesheet));
    },
  );

  async function loadTimesheetForOrg(organisationId: string, id: string) {
    const timesheet = await loadTimesheetOrNull(id);
    if (!timesheet || timesheet.booking.vacancy.organisationId !== organisationId) return null;
    return timesheet;
  }

  app.get(
    "/v1/organisations/:organisationId/timesheets/:id",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", ...STAFF_READ_ROLES)] },
    async (request, reply) => {
      const { organisationId, id } = request.params as { organisationId: string; id: string };
      const timesheet = await loadTimesheetForOrg(organisationId, id);
      if (!timesheet) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      reply.send(serializeTimesheet(timesheet));
    },
  );

  app.post(
    "/v1/organisations/:organisationId/timesheets/:id/send-for-approval",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", WORKFORCE_ROLE)] },
    async (request, reply) => {
      const parsed = sendForApprovalBody.safeParse(request.body ?? {});
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const { organisationId, id } = request.params as { organisationId: string; id: string };
      const timesheet = await loadTimesheetForOrg(organisationId, id);
      if (!timesheet) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      if (!([TimesheetStatus.SUBMITTED, TimesheetStatus.APPROVAL_SENT] as TimesheetStatus[]).includes(timesheet.status)) {
        reply.code(409).send({ error: `Timesheet is ${timesheet.status}, not SUBMITTED` });
        return;
      }

      const { recipient, expiresInDays } = parsed.data;
      const { token, tokenHash } = generateApprovalToken();
      const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

      await prisma.$transaction([
        prisma.approvalToken.create({ data: { timesheetId: id, tokenHash, recipient, expiresAt } }),
        prisma.timesheet.update({ where: { id }, data: { status: TimesheetStatus.APPROVAL_SENT } }),
      ]);

      await recordAuditEvent(prisma, {
        eventType: "timesheet.send-for-approval",
        actorId: request.authUser!.id,
        actingOrgId: organisationId,
        resourceType: "Timesheet",
        resourceId: id,
        outcome: "success",
        metadata: { recipient },
      });

      // The raw token is returned exactly once — like an MFA backup code —
      // and never persisted in plaintext. No notification service exists
      // yet (documented gap, see modules/timesheet/index.ts), so staff
      // must copy and send this link to the approver themselves.
      reply.code(201).send({ token, expiresAt });
    },
  );

  app.post(
    "/v1/organisations/:organisationId/timesheets/:id/reconcile",
    { preHandler: [app.authenticate, app.requireOrgRoleAtParam("organisationId", FINANCE_ROLE)] },
    async (request, reply) => {
      const parsed = reconcileBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const { organisationId, id } = request.params as { organisationId: string; id: string };
      const timesheet = await loadTimesheetForOrg(organisationId, id);
      if (!timesheet) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      if (timesheet.status !== TimesheetStatus.APPROVED) {
        reply.code(409).send({ error: `Timesheet is ${timesheet.status}, not APPROVED` });
        return;
      }

      await prisma.timesheet.update({
        where: { id },
        data: { status: TimesheetStatus.RECONCILED, reconciliationRef: parsed.data.reconciliationRef },
      });

      await recordAuditEvent(prisma, {
        eventType: "timesheet.reconcile",
        actorId: request.authUser!.id,
        actingOrgId: organisationId,
        resourceType: "Timesheet",
        resourceId: id,
        outcome: "success",
        metadata: { reconciliationRef: parsed.data.reconciliationRef },
      });

      const updated = await loadTimesheetOrNull(id);
      reply.send(serializeTimesheet(updated!));
    },
  );

  // -------------------------------------------------------------------
  // External approver: no platform account, token-gated only (§33 —
  // "External timesheet approver: single-purpose token plus OTP/risk-
  // based assurance"; OTP step-up is a documented gap, not built here).
  // -------------------------------------------------------------------
  async function loadActiveTokenOrNull(rawToken: string) {
    const tokenHash = hashApprovalToken(rawToken);
    const approvalToken = await prisma.approvalToken.findFirst({
      where: { tokenHash },
      include: { timesheet: { include: TIMESHEET_INCLUDE } },
    });
    if (!approvalToken) return { error: 404 as const };
    if (approvalToken.status !== TokenStatus.ACTIVE || approvalToken.expiresAt < new Date()) {
      return { error: 410 as const };
    }
    return { approvalToken };
  }

  app.get("/v1/timesheets/approve/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const result = await loadActiveTokenOrNull(token);
    if (result.error === 404) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    if (result.error === 410) {
      reply.code(410).send({ error: "This approval link has expired or already been used" });
      return;
    }
    reply.send(serializeTimesheet(result.approvalToken.timesheet));
  });

  app.post("/v1/timesheets/approve/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const result = await loadActiveTokenOrNull(token);
    if (result.error === 404) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    if (result.error === 410) {
      reply.code(410).send({ error: "This approval link has expired or already been used" });
      return;
    }
    const parsed = decisionBody.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    const { approvalToken } = result;
    const timesheet = approvalToken.timesheet;
    const { decision, reason, amendedVersion } = parsed.data;

    await prisma.$transaction(async (tx) => {
      await tx.approvalToken.update({
        where: { id: approvalToken.id },
        data: { status: TokenStatus.USED, decidedAt: new Date(), decisionReason: reason },
      });

      if (decision === "APPROVE") {
        await tx.timesheet.update({ where: { id: timesheet.id }, data: { status: TimesheetStatus.APPROVED, approvedAt: new Date() } });
        await tx.booking.update({ where: { id: timesheet.booking.id }, data: { status: BookingStatus.CLOSED } });
        await tx.vacancy.update({ where: { id: timesheet.booking.vacancy.id }, data: { status: VacancyStatus.COMPLETE } });
      } else if (decision === "REJECT") {
        await tx.timesheet.update({ where: { id: timesheet.id }, data: { status: TimesheetStatus.REJECTED } });
      } else {
        const nextVersion = timesheet.currentVersion + 1;
        const { allowances, ...claim } = amendedVersion!;
        await tx.timesheetVersion.create({
          data: {
            timesheetId: timesheet.id,
            version: nextVersion,
            ...claim,
            allowancesJson: allowances as Prisma.InputJsonValue | undefined,
          },
        });
        await tx.timesheet.update({
          where: { id: timesheet.id },
          data: { status: TimesheetStatus.AMENDED, currentVersion: nextVersion },
        });
      }
    });

    await recordAuditEvent(prisma, {
      eventType: "timesheet.approval.decide",
      resourceType: "Timesheet",
      resourceId: timesheet.id,
      outcome: "success",
      metadata: { decision, reason, approvalTokenId: approvalToken.id, recipient: approvalToken.recipient },
    });

    const updated = await loadTimesheetOrNull(timesheet.id);
    reply.send(serializeTimesheet(updated!));
  });
}
