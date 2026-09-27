/**
 * Eligibility bounded context.
 *
 * Owns: deterministic, explainable evaluation of a practitioner against a
 * vacancy's published RequirementSet at a point in time.
 * Does not own: authoritative source data (registration, scope, fatigue
 * history, etc.) — it only evaluates and explains against it.
 *
 * INVARIANT: a requirement whose source data is missing or stale resolves
 * to INDETERMINATE, never to an optimistic ELIGIBLE. See
 * docs/spec/02-ynlhn-mvp-product-spec-v1.0.docx §14 for the reference
 * pseudocode and the fixture table in
 * docs/spec/01-technical-architecture-data-model-v0.2.docx §46.
 *
 * Fatigue (docs/addendum/v0.3-addendum.md §1) follows the same
 * PASS/FAIL/INDETERMINATE pattern via modules/fatigue, evaluated as one
 * requirement among the RequirementSet rather than a separate gate.
 */
export {};
