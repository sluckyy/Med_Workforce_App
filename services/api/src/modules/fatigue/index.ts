import type { FastifyInstance } from "fastify";
import { registerFatigueRoutes } from "./routes.js";

/**
 * Fatigue & Cross-Organisation Safety bounded context.
 * Added by docs/addendum/v0.3-addendum.md §1 — not present in the v0.2/v1.0
 * baseline spec.
 *
 * Owns: WorkEpisode, FatigueRule, FatigueAssessment, FatigueDeclaration.
 * Does not own: the eligibility decision itself — fatigue status is one
 * requirement evaluated by modules/eligibility (see FATIGUE in
 * modules/eligibility/evaluators.ts), following the same
 * PASS/FAIL/INDETERMINATE pattern as every other requirement type. A
 * booking's confirm step (modules/exchange) writes the authoritative
 * WorkEpisode; this module adds the self-declared side of the picture plus
 * rule authoring.
 *
 * MVP scope and documented gaps:
 * - A FatigueRule's parametersJson (rules.ts: minimum inter-shift break,
 *   maximum consecutive hours, maximum rolling 7/14/28-day hours; strict
 *   schema, so a mistyped key is rejected rather than stored and ignored)
 *   is applied in two passes. Against confirmed platform bookings — facts
 *   this platform is authoritative about — any breach is a hard FAIL.
 *   With the doctor's self-declared episodes added, a breach is UNKNOWN,
 *   never a silent PASS or FAIL, because the platform cannot verify them.
 *   It becomes a genuine cross-organisation hard gate only once a shared
 *   WorkEpisode event feed exists across participating LHNs.
 * - A rule must exist and be PUBLISHED for the evaluator to resolve
 *   anything beyond UNKNOWN; a rule with no limits set checks overlap only.
 *   Availability.recurrenceJson and WorkEpisode PARTNER_FEED are not
 *   consumed (no partner feed exists yet).
 * - FatigueAssessment (a dedicated history table for fatigue-specific
 *   checks) is modelled in the schema but not written to by this module —
 *   the standard eligibility pipeline persists its own EligibilityAssessment
 *   record per candidate/vacancy assessment instead, which already captures
 *   the FATIGUE requirement's outcome. Nothing here duplicates that.
 * - No override/exception mechanism (e.g. a documented fatigue-risk
 *   acceptance by a senior clinician) is built.
 */
export function registerFatigueModule(app: FastifyInstance) {
  registerFatigueRoutes(app);
}
