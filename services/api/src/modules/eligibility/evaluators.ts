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
import type { Prisma, PrismaClient, Requirement } from "@prisma/client";

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

export const EVALUATORS: Record<string, Evaluator> = {
  activeScopeAtFacility,
  registrationCurrent: credentialCurrent,
  credentialCurrent,
  availableForWindow,
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
