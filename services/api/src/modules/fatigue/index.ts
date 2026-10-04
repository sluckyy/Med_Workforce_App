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
 * - Only a confirmed platform booking is a hard FAIL on overlap; a
 *   self-declared external engagement is UNKNOWN, never a silent PASS or
 *   FAIL, because the platform cannot verify it. It becomes a genuine
 *   cross-organisation hard gate only once a shared WorkEpisode event feed
 *   exists across participating LHNs.
 * - FatigueRule.parametersJson is stored but not yet interpreted for
 *   rolling-hours or inter-shift-break arithmetic — only direct time-window
 *   overlap is checked against existing episodes. A rule must exist and be
 *   PUBLISHED for the evaluator to resolve anything beyond UNKNOWN; the
 *   parameters themselves are not yet read by the evaluator.
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
