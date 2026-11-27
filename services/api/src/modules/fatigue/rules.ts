import { z } from "zod";

// The three rule families docs/addendum/v0.3-addendum.md §1 names for a
// FatigueRule. Strict: an unknown key is rejected at authoring time rather
// than stored and silently ignored, so a typo can never disable a rule.
export const fatigueRuleParametersSchema = z
  .object({
    minInterShiftBreakHours: z.number().positive().optional(),
    maxConsecutiveHours: z.number().positive().optional(),
    maxRollingHours: z.object({ days: z.number().int().min(1).max(28), hours: z.number().positive() }).strict().optional(),
  })
  .strict();

export type FatigueRuleParameters = z.infer<typeof fatigueRuleParametersSchema>;

export interface Interval {
  startAt: Date;
  endAt: Date;
}

const HOUR = 3_600_000;
const hours = (ms: number) => Math.round((ms / HOUR) * 10) / 10;
const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ") + "Z";

// Pure arithmetic: given a proposed shift, the practitioner's other work
// episodes and a rule, return every specific breach (empty = within rule).
// The caller decides what a breach means — FAIL for platform-known episodes,
// UNKNOWN once self-declared ones are added (see modules/eligibility).
export function evaluateFatigueRules(shift: Interval, episodes: Interval[], params: FatigueRuleParameters): string[] {
  const breaches: string[] = [];
  const S = shift.startAt.getTime();
  const E = shift.endAt.getTime();

  const overlapping = episodes.filter((e) => e.startAt.getTime() < E && e.endAt.getTime() > S);
  for (const e of overlapping) {
    breaches.push(`overlaps a booked shift ${fmt(e.startAt)} – ${fmt(e.endAt)}`);
  }

  const B = params.minInterShiftBreakHours;
  if (B !== undefined) {
    for (const e of episodes) {
      if (overlapping.includes(e)) continue;
      const gapBefore = e.endAt.getTime() <= S ? S - e.endAt.getTime() : null;
      const gapAfter = e.startAt.getTime() >= E ? e.startAt.getTime() - E : null;
      if (gapBefore !== null && gapBefore < B * HOUR) {
        breaches.push(`only ${hours(gapBefore)}h break after the booked shift ending ${fmt(e.endAt)}; rule requires ${B}h`);
      }
      if (gapAfter !== null && gapAfter < B * HOUR) {
        breaches.push(`only ${hours(gapAfter)}h break before the booked shift starting ${fmt(e.startAt)}; rule requires ${B}h`);
      }
    }
  }

  const C = params.maxConsecutiveHours;
  if (C !== undefined) {
    // The stretch of work this shift would belong to: the shift merged with
    // every episode reachable through gaps shorter than the minimum break
    // (or touching/overlapping, when no minimum break is configured).
    const joinGap = (B ?? 0) * HOUR;
    let start = S;
    let end = E;
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of episodes) {
        const es = e.startAt.getTime();
        const ee = e.endAt.getTime();
        const connected = es <= end + joinGap && ee >= start - joinGap;
        if (connected && (es < start || ee > end)) {
          start = Math.min(start, es);
          end = Math.max(end, ee);
          grew = true;
        }
      }
    }
    if (end - start > C * HOUR) {
      const own = hours(E - S);
      breaches.push(
        end - start === E - S
          ? `${own}h shift exceeds the ${C}h maximum consecutive hours`
          : `${hours(end - start)}h continuous stretch (this ${own}h shift plus adjacent booked shifts) exceeds the ${C}h maximum`,
      );
    }
  }

  const R = params.maxRollingHours;
  if (R !== undefined) {
    const L = R.days * 24 * HOUR;
    const all = [...episodes, shift];
    // The maximum over all L-long windows that include any of this shift is
    // attained at a window starting at some interval's start or ending at
    // some interval's end, so only those candidates need checking.
    const candidates = new Set<number>();
    for (const i of all) {
      candidates.add(i.startAt.getTime());
      candidates.add(i.endAt.getTime() - L);
    }
    let worst = 0;
    let worstStart = S;
    for (const w of candidates) {
      if (w + L <= S || w >= E) continue; // window doesn't touch this shift
      let total = 0;
      for (const i of all) total += Math.max(0, Math.min(i.endAt.getTime(), w + L) - Math.max(i.startAt.getTime(), w));
      if (total > worst) {
        worst = total;
        worstStart = w;
      }
    }
    if (worst > R.hours * HOUR) {
      breaches.push(`${hours(worst)}h in the ${R.days}-day window from ${fmt(new Date(worstStart))} exceeds the ${R.hours}h maximum`);
    }
  }

  return breaches;
}

// Human-readable summary of which limits a passing shift was checked against.
export function describeRule(params: FatigueRuleParameters): string {
  const parts: string[] = [];
  if (params.minInterShiftBreakHours !== undefined) parts.push(`${params.minInterShiftBreakHours}h minimum break`);
  if (params.maxConsecutiveHours !== undefined) parts.push(`${params.maxConsecutiveHours}h maximum consecutive`);
  if (params.maxRollingHours) parts.push(`${params.maxRollingHours.hours}h per ${params.maxRollingHours.days} days`);
  return parts.length ? parts.join(", ") : "no overlapping shift (rule sets no hour limits)";
}
