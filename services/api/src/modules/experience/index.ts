import type { FastifyInstance } from "fastify";
import { registerExperienceRoutes } from "./routes.js";

/**
 * Locum Experience bounded context.
 *
 * Owns: confidential post-shift survey, aggregation, improvement actions.
 * Does not own: formal incident management — a survey response indicating a
 * safety concern must be routed to the organisation's existing formal
 * reporting pathway, never treated as the incident channel itself. This
 * module enforces that boundary only on the frontend (a "not the incident
 * channel" redirect notice), not by inspecting free text server-side.
 *
 * INVARIANT: routine dashboards return aggregated results only, gated by a
 * minimum-n threshold (modules/experience/aggregate.ts's MIN_AGGREGATE_N)
 * enforced in the query layer itself — computeExperienceAggregate() is the
 * only way this module's staff-facing route reads ExperienceResponse rows,
 * and it never returns a row below the threshold or a raw practitioner
 * identity. See docs/addendum/v0.3-addendum.md §6 — this is one of the
 * handful of things "fixed from day one," not left to dashboard convention.
 *
 * Raw practitioner linkage is pseudonymised via practitionerAnalyticsKey
 * (an HMAC of the practitioner id keyed on the platform's own JWT secret —
 * reusing an existing secret rather than introducing a second one to
 * manage). The key is stored but not yet read by anything: there is no
 * longitudinal-by-pseudonym view built yet, only per-facility aggregation.
 *
 * Documented gaps:
 * - No content-moderation pipeline classifies free text as sensitive; a
 *   doctor self-flags a response (flagSensitive) to withhold it from
 *   aggregate reporting (ReportabilityStatus.RESTRICTED) instead.
 * - ImprovementAction has no organisationId column in the baseline schema
 *   (only an optional siteFacilityId), so authorship/visibility here is
 *   gated by holding the right role at any organisation, not scoped per
 *   organisation — acceptable at single-LHN pilot scale, not at multi-
 *   tenant general availability.
 *
 * See docs/spec/01-technical-architecture-data-model-v0.2.docx §4, §23.
 */
export function registerExperienceModule(app: FastifyInstance) {
  registerExperienceRoutes(app);
}
