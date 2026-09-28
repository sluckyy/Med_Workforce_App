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
 *
 * Status: POST /v1/eligibility/evaluate is a stateless dry-run — it
 * computes and returns a result without persisting an EligibilityAssessment
 * row, because that model requires a Vacancy (modules/exchange, not built
 * yet). Real evaluators exist for ACTIVE_SCOPE, REGISTRATION,
 * CREDENTIAL/TRAINING and AVAILABILITY (see evaluators.ts); every other
 * RequirementType resolves UNKNOWN via the same "no implementation ->
 * never an optimistic PASS" fallback, not a silent skip. All five fixture
 * scenarios from spec §46 that don't require a persisted Vacancy were
 * checked against this engine before commit — see the module's test notes
 * in the commit message.
 */
import type { FastifyInstance } from "fastify";
import { registerEligibilityRoutes } from "./routes.js";

export function registerEligibilityModule(app: FastifyInstance) {
  registerEligibilityRoutes(app);
}
