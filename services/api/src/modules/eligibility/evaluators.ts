/**
 * Deterministic, explainable requirement evaluators.
 *
 * Each evaluator is named by Requirement.evaluator (a plain string — "Code/
 * config-based deterministic evaluators initially; no separate rules
 * product required", per the spec's recommended stack table) and looked up
 * in EVALUATORS below. A name with no matching implementation always
 * resolves UNKNOWN, never an optimistic PASS — this is the enforcement
 * point for the platform-wide invariant that missing data must never
 * default to ELIGIBLE.
 */
import type { Prisma, PrismaClient, Requirement, RequirementSet } from "@prisma/client";

export interface EvaluatorContext {
  prisma: PrismaClient;
  practitionerId: string;
  asOf: Date;
  // Only meaningful for evaluators that need a concrete time window (e.g.
  // AVAILABILITY) — there is no persisted Vacancy to read dates from yet
  // (modules/exchange isn't built), so the caller may supply one directly.
  window?: { startAt: Date; endAt: Date };
}

export interface EvaluatorResult {
  status: "PASS" | "FAIL" | "UNKNOWN";
  explanation: string;
}

type Evaluator = (requirement: Requirement, ctx: EvaluatorContext) => Promise<EvaluatorResult>;

function getParam(requirement: Requirement, key: string): string | undefined {
  const params = requirement.parametersJson as Prisma.JsonObject | null;
  const value = params?.[key];
  return typeof value === "string" ? value : undefined;
}

// ACTIVE_SCOPE — parameters: { roleActivityCode, facilityId? }. PASS only
// for a scope grant that is ACTIVE, currently within its effective window,
// matches the role/activity code, and — when a facility is specified —
// actually covers that facility. A grant active at a different facility
// (or suspended, expired, or simply absent) is FAIL, never UNKNOWN: the
// organisation's own ScopeGrant records are authoritative and always
// queryable, so "we don't have one" is a known fact, not missing data.
const activeScopeAtFacility: Evaluator = async (requirement, ctx) => {
  const roleActivityCode = getParam(requirement, "roleActivityCode");
  const facilityId = getParam(requirement, "facilityId");
  if (!roleActivityCode) {
    return { status: "UNKNOWN", explanation: "Requirement is missing roleActivityCode parameter" };
  }

  const grants = await ctx.prisma.scopeGrant.findMany({
    where: { practitionerId: ctx.practitionerId, roleActivityCode, status: "ACTIVE" },
    include: { facilities: true },
  });

  const match = grants.find((g) => {
    const startsOk = !g.effectiveFrom || g.effectiveFrom <= ctx.asOf;
    const endsOk = !g.effectiveTo || g.effectiveTo >= ctx.asOf;
    const facilityOk = !facilityId || g.facilities.some((f) => f.facilityId === facilityId);
    return startsOk && endsOk && facilityOk;
  });

  if (match) {
    return { status: "PASS", explanation: `Active scope grant for ${roleActivityCode} covers the required facility` };
  }
  if (grants.length > 0) {
    return {
      status: "FAIL",
      explanation:
        requirement.failureMessage ??
        `An active scope grant for ${roleActivityCode} exists but does not cover the required facility or window`,
    };
  }
  return {
    status: "FAIL",
    explanation: requirement.failureMessage ?? `No active scope grant for ${roleActivityCode}`,
  };
};

// Shared by REGISTRATION, CREDENTIAL and TRAINING — parameters:
// { definitionCode }. Keys off the credential's *latest Verification*
// result, not just PractitionerCredential.status: a self-declared claim
// that has never been reviewed is UNKNOWN ("indeterminate"), a claim a
// credentialling officer has positively rejected is FAIL, and only a
// VERIFIED result (still within any validUntil window) is PASS. This is
// what makes modules/assurance's verification action actually change an
// eligibility outcome, rather than the two modules being disconnected.
const credentialCurrent: Evaluator = async (requirement, ctx) => {
  const definitionCode = getParam(requirement, "definitionCode");
  if (!definitionCode) {
    return { status: "UNKNOWN", explanation: "Requirement is missing definitionCode parameter" };
  }

  const credential = await ctx.prisma.practitionerCredential.findFirst({
    where: {
      practitionerId: ctx.practitionerId,
      definition: { code: definitionCode },
      status: { not: "SUPERSEDED" },
    },
    orderBy: { createdAt: "desc" },
    include: { verifications: { orderBy: { verifiedAt: "desc" }, take: 1 }, definition: true },
  });

  if (!credential) {
    return {
      status: "FAIL",
      explanation: requirement.failureMessage ?? `No ${definitionCode} credential declared`,
    };
  }
  if (credential.status === "REVOKED") {
    return { status: "FAIL", explanation: requirement.failureMessage ?? `${definitionCode} has been revoked` };
  }
  if (credential.expiryDate && credential.expiryDate < ctx.asOf) {
    return { status: "FAIL", explanation: requirement.failureMessage ?? `${definitionCode} expired ${credential.expiryDate.toDateString()}` };
  }

  const latest = credential.verifications[0];
  if (!latest) {
    return {
      status: "UNKNOWN",
      explanation: requirement.unknownMessage ?? `${definitionCode} has not yet been verified`,
    };
  }
  if (latest.result === "VERIFIED") {
    if (latest.validUntil && latest.validUntil < ctx.asOf) {
      return {
        status: "UNKNOWN",
        explanation: requirement.unknownMessage ?? `${definitionCode}'s verification expired ${latest.validUntil.toDateString()} and needs re-verification`,
      };
    }
    return { status: "PASS", explanation: `${definitionCode} verified ${latest.verifiedAt.toDateString()}` };
  }
  if (latest.result === "FAILED" || latest.result === "REVOKED") {
    return {
      status: "FAIL",
      explanation: requirement.failureMessage ?? `${definitionCode} verification result: ${latest.result}`,
    };
  }
  // PARTIAL, UNABLE, SUPERSEDED — a verification was attempted but didn't
  // reach a positive or negative conclusion.
  return {
    status: "UNKNOWN",
    explanation: requirement.unknownMessage ?? `${definitionCode} verification is ${latest.result.toLowerCase()}, not yet resolved`,
  };
};

// AVAILABILITY — needs a concrete time window, which (absent
// modules/exchange) only exists if the caller of /v1/eligibility/evaluate
// supplied one. No window supplied is UNKNOWN, not an optimistic PASS.
const availableForWindow: Evaluator = async (requirement, ctx) => {
  if (!ctx.window) {
    return {
      status: "UNKNOWN",
      explanation: requirement.unknownMessage ?? "No date window supplied to evaluate availability against",
    };
  }
  const blocking = await ctx.prisma.availability.findFirst({
    where: {
      practitionerId: ctx.practitionerId,
      status: "UNAVAILABLE",
      startAt: { lt: ctx.window.endAt },
      endAt: { gt: ctx.window.startAt },
    },
  });
  if (blocking) {
    return {
      status: "FAIL",
      explanation: requirement.failureMessage ?? "Practitioner has declared themselves unavailable for this window",
    };
  }
  return { status: "PASS", explanation: "No declared unavailability overlaps this window" };
};

// AREA_OF_NEED — parameters: { facilityId }. docs/addendum/v0.3-addendum.md
// §2: "Not practitioner-portable — facility/position-specific, never
// inferred from a prior determination elsewhere." Same FAIL-not-UNKNOWN
// shape as activeScopeAtFacility: an AreaOfNeedDetermination is always
// organisation-issued and queryable, so "none covering this facility" is
// a known fact, not missing data.
const areaOfNeedCurrent: Evaluator = async (requirement, ctx) => {
  const facilityId = getParam(requirement, "facilityId");
  if (!facilityId) {
    return { status: "UNKNOWN", explanation: "Requirement is missing facilityId parameter" };
  }
  const determinations = await ctx.prisma.areaOfNeedDetermination.findMany({
    where: { practitionerId: ctx.practitionerId, status: "ACTIVE", facilityId },
  });
  const match = determinations.find((d) => {
    const startsOk = !d.effectiveFrom || d.effectiveFrom <= ctx.asOf;
    const endsOk = !d.effectiveTo || d.effectiveTo >= ctx.asOf;
    return startsOk && endsOk;
  });
  if (match) {
    return { status: "PASS", explanation: "Active Area of Need determination covers this facility" };
  }
  return {
    status: "FAIL",
    explanation: requirement.failureMessage ?? "No active Area of Need determination for this facility",
  };
};

// MORATORIUM_LOCATION — parameters: { facilityId }. Independent of
// ACTIVE_SCOPE (§2). Unlike AreaOfNeedDetermination, no MoratoriumStatus
// row at all is a genuine UNKNOWN rather than a confident PASS or FAIL:
// moratorium/DWS status is a Commonwealth determination (VEVO), not
// something this organisation's own records can be authoritative about
// simply by their absence — "never checked" must not be conflated with
// "cleared." A row with restricted=true blocks every facility except the
// one it's specifically recorded against (read as the practitioner's
// documented DWS-area exception), and restricted=false clears them
// outright. This reading is an interpretation of a genuinely ambiguous
// spec passage — see docs/addendum/v0.3-addendum.md §2 — not a literal
// field-by-field spec quote.
const moratoriumLocationClear: Evaluator = async (requirement, ctx) => {
  const facilityId = getParam(requirement, "facilityId");
  if (!facilityId) {
    return { status: "UNKNOWN", explanation: "Requirement is missing facilityId parameter" };
  }
  const statuses = await ctx.prisma.moratoriumStatus.findMany({ where: { practitionerId: ctx.practitionerId } });
  const current = statuses.filter((s) => {
    const startsOk = !s.effectiveFrom || s.effectiveFrom <= ctx.asOf;
    const endsOk = !s.effectiveTo || s.effectiveTo >= ctx.asOf;
    return startsOk && endsOk;
  });
  if (current.length === 0) {
    return {
      status: "UNKNOWN",
      explanation: requirement.unknownMessage ?? "Moratorium/DWS status has not been determined for this practitioner",
    };
  }
  const restricting = current.find((s) => s.restricted && s.facilityId !== facilityId);
  if (restricting) {
    return {
      status: "FAIL",
      explanation:
        requirement.failureMessage ?? "Practitioner is subject to a moratorium/DWS restriction that does not cover this facility",
    };
  }
  return { status: "PASS", explanation: "No moratorium/DWS restriction blocks this facility" };
};

// FATIGUE — parameters: { ruleCode }. docs/addendum/v0.3-addendum.md §1:
// "MVP scope: hard gate only on what the platform can know for certain
// (its own double-bookings for one practitioner). Anything relying on
// self-declaration produces INDETERMINATE... never silently blocked and
// never silently passed." A PLATFORM_BOOKING WorkEpisode (created when a
// booking is confirmed — see modules/exchange) that overlaps the window
// is a fact this platform itself is authoritative about, so it's a hard
// FAIL; a SELF_DECLARED episode (lower assurance by definition) can only
// ever push the result to UNKNOWN, never to a confident FAIL or PASS on
// its own. FatigueRule.parametersJson's rolling-hours/inter-shift-break
// thresholds are stored and versioned but not yet interpreted here — only
// direct time-window overlap is checked, a documented simplification
// (see modules/fatigue/index.ts), not a silent one.
const fatigueCheck: Evaluator = async (requirement, ctx) => {
  if (!ctx.window) {
    return { status: "UNKNOWN", explanation: "No date window supplied to evaluate fatigue exposure against" };
  }
  const ruleCode = getParam(requirement, "ruleCode");
  if (!ruleCode) {
    return { status: "UNKNOWN", explanation: "Requirement is missing ruleCode parameter" };
  }
  const rule = await ctx.prisma.fatigueRule.findUnique({ where: { code: ruleCode } });
  if (!rule || rule.status !== "PUBLISHED") {
    return { status: "UNKNOWN", explanation: `No published fatigue rule "${ruleCode}"` };
  }

  const episodes = await ctx.prisma.workEpisode.findMany({
    where: {
      practitionerId: ctx.practitionerId,
      startAt: { lt: ctx.window.endAt },
      endAt: { gt: ctx.window.startAt },
    },
  });

  const platformConflict = episodes.find((e) => e.source === "PLATFORM_BOOKING");
  if (platformConflict) {
    return {
      status: "FAIL",
      explanation:
        requirement.failureMessage ?? "Practitioner already has a confirmed platform booking that overlaps this window",
    };
  }
  const selfDeclaredConflict = episodes.find((e) => e.source === "SELF_DECLARED");
  if (selfDeclaredConflict) {
    return {
      status: "UNKNOWN",
      explanation:
        requirement.unknownMessage ??
        "A self-declared external engagement overlaps this window — lower assurance, cannot confirm no conflict",
    };
  }
  return { status: "PASS", explanation: "No known overlapping work episode for this window" };
};

export const EVALUATORS: Record<string, Evaluator> = {
  activeScopeAtFacility,
  registrationCurrent: credentialCurrent,
  credentialCurrent,
  availableForWindow,
  areaOfNeedCurrent,
  moratoriumLocationClear,
  fatigueCheck,
};

export async function runEvaluator(
  requirement: Requirement,
  ctx: EvaluatorContext,
): Promise<EvaluatorResult> {
  const evaluator = EVALUATORS[requirement.evaluator];
  if (!evaluator) {
    return {
      status: "UNKNOWN",
      explanation: `No evaluator implementation for "${requirement.evaluator}" (requirement type ${requirement.type})`,
    };
  }
  return evaluator(requirement, ctx);
}

export interface RequirementResult {
  requirementId: string;
  code: string;
  type: string;
  hard: boolean;
  status: "PASS" | "FAIL" | "UNKNOWN";
  explanation: string;
}

export type OverallStatus = "ELIGIBLE" | "INELIGIBLE" | "INDETERMINATE";

// The single rollup rule, shared by every caller (the stateless
// POST /v1/eligibility/evaluate and modules/exchange's persisted
// assessment) so they can never silently diverge. Only hard requirements
// gate the overall status; FAIL always outranks UNKNOWN — see
// docs/spec/01-technical-architecture-data-model-v0.2.docx §46.
export async function evaluateRequirementSet(
  prisma: PrismaClient,
  requirementSet: RequirementSet & { requirements: Requirement[] },
  practitionerId: string,
  opts: { asOf?: Date; window?: { startAt: Date; endAt: Date } } = {},
): Promise<{ status: OverallStatus; assessedAt: Date; results: RequirementResult[] }> {
  const assessedAt = opts.asOf ?? new Date();
  const results = await Promise.all(
    requirementSet.requirements.map(async (requirement) => {
      const result = await runEvaluator(requirement, {
        prisma,
        practitionerId,
        asOf: assessedAt,
        window: opts.window,
      });
      return {
        requirementId: requirement.id,
        code: requirement.code,
        type: requirement.type,
        hard: requirement.hard,
        ...result,
      };
    }),
  );

  const hardResults = results.filter((r) => r.hard);
  const status: OverallStatus = hardResults.some((r) => r.status === "FAIL")
    ? "INELIGIBLE"
    : hardResults.some((r) => r.status === "UNKNOWN")
      ? "INDETERMINATE"
      : "ELIGIBLE";

  return { status, assessedAt, results };
}
