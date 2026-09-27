/**
 * Workforce Exchange bounded context.
 *
 * Owns: Vacancy, Candidate, Booking, Placement (docs/addendum/v0.3-addendum.md
 * §3 — the aggregate above Booking for non-contiguous block/on-call
 * engagements such as rural generalist procedural coverage).
 * Does not own: credential authority or scope decisions (eligibility gates
 * this context's transitions but is computed by modules/eligibility).
 *
 * RoleTemplate.deliveryMode / Vacancy.deliveryMode (docs/addendum/
 * v0.3-addendum.md §4) distinguish IN_PERSON, TELEHEALTH_SYNCHRONOUS and
 * HYBRID — the vacancy/booking/eligibility workflow is identical across
 * modes; only the requirement set and travel/accommodation fields differ.
 *
 * See docs/spec/01-technical-architecture-data-model-v0.2.docx §4, §17-18.
 */
export {};
