/**
 * Fatigue & Cross-Organisation Safety bounded context.
 * Added by docs/addendum/v0.3-addendum.md §1 — not present in the v0.2/v1.0
 * baseline spec.
 *
 * Owns: WorkEpisode, FatigueRule, FatigueAssessment, FatigueDeclaration.
 * Does not own: the eligibility decision itself — fatigue status is one
 * requirement evaluated by modules/eligibility, following the same
 * PASS/FAIL/INDETERMINATE pattern as every other requirement type.
 *
 * MVP scope: hard-gate only what the platform can know for certain (its own
 * double-bookings for one practitioner). Anything relying on
 * self-declaration (WorkEpisodeSource.SELF_DECLARED) must resolve to
 * INDETERMINATE and be surfaced to a human, never silently blocked or
 * silently passed. It becomes a genuine cross-organisation hard gate only
 * once a shared WorkEpisode event feed exists across participating LHNs.
 */
export {};
