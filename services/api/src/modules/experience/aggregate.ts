import type { PrismaClient } from "@prisma/client";

// Pilot-stage placeholder threshold — the exact n is for the pilot's
// governance process to set, per docs/addendum/v0.3-addendum.md §6's
// adaptive-governance philosophy. What's fixed is that suppression happens
// HERE, in the aggregation function every dashboard route calls, not as a
// convention the frontend is trusted to apply.
export const MIN_AGGREGATE_N = 5;

const SCORE_KEYS = ["culture", "support", "orientation", "workload", "returnIntention"] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

export interface FacilityAggregate {
  facilityId: string;
  facilityName: string;
  n: number;
  suppressed: boolean;
  scores: Record<ScoreKey, number> | null;
}

// No caller of this function, and no route in this module, ever returns an
// individual ExperienceResponse (or practitioner identity) to staff — only
// this pre-aggregated, n-gated shape.
export async function computeExperienceAggregate(
  prisma: PrismaClient,
  organisationId: string,
): Promise<FacilityAggregate[]> {
  const facilities = await prisma.facility.findMany({
    where: { organisationId },
    select: { id: true, name: true },
  });
  const facilityIds = facilities.map((f) => f.id);

  const responses = await prisma.experienceResponse.findMany({
    where: { siteFacilityId: { in: facilityIds }, reportability: "AGGREGATABLE" },
    select: { siteFacilityId: true, scoresJson: true },
  });

  const byFacility = new Map<string, Record<string, unknown>[]>();
  for (const r of responses) {
    if (!r.siteFacilityId) continue;
    const list = byFacility.get(r.siteFacilityId) ?? [];
    list.push(r.scoresJson as Record<string, unknown>);
    byFacility.set(r.siteFacilityId, list);
  }

  return facilities.map((f) => {
    const rows = byFacility.get(f.id) ?? [];
    const n = rows.length;

    if (n < MIN_AGGREGATE_N) {
      return { facilityId: f.id, facilityName: f.name, n, suppressed: true, scores: null };
    }

    const scores = {} as Record<ScoreKey, number>;
    for (const key of SCORE_KEYS) {
      const values = rows.map((row) => Number(row[key])).filter((v) => Number.isFinite(v));
      scores[key] = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : NaN;
    }
    return { facilityId: f.id, facilityName: f.name, n, suppressed: false, scores };
  });
}
