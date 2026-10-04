/**
 * Workforce Access bounded context (IMG / visa / Area of Need).
 *
 * Owns: AreaOfNeedDetermination (organisation-issued, facility/position-
 * specific, never practitioner-portable — modelled like ScopeGrant) and
 * MoratoriumStatus (the Commonwealth 10-year moratorium / District of
 * Workforce Shortage location-restriction gate, independent of clinical
 * eligibility). Does not own visa/registration-type credential data
 * itself — PractitionerCredential.registrationType (fed from
 * modules/passport's declare/edit endpoints) and the
 * IMMIGRATION_WORK_RIGHTS_VISA / ENGLISH_LANGUAGE_TEST_IELTS
 * CredentialDefinitions already cover that; this module only adds the
 * two determinations the v0.2 credential model had no entity for.
 *
 * Added by docs/addendum/v0.3-addendum.md §2 — "plausibly the single
 * biggest practical blocker to mobilisation for this cohort — more so
 * than clinical ScopeGrant status." Immigration/visa data sits in the
 * RESTRICTED sensitivity compartment — excluded from every default
 * CredentialShare bundle (see modules/sharing), though the doctor can
 * still choose to include it item-by-item.
 *
 * New Requirement types AREA_OF_NEED and MORATORIUM_LOCATION have real
 * evaluators in modules/eligibility/evaluators.ts (areaOfNeedCurrent,
 * moratoriumLocationClear); VISA_WORK_RIGHTS reuses the existing
 * CREDENTIAL evaluator against IMMIGRATION_WORK_RIGHTS_VISA rather than
 * needing a dedicated implementation.
 *
 * Status: issue/list/withdraw an AreaOfNeedDetermination (SCOPE_APPROVER
 * — "modelled like ScopeGrant", so it reuses that authority), record/list
 * a MoratoriumStatus (CREDENTIAL_OFFICER — a compliance/verification
 * determination, closer to that module's domain), and read-only views of
 * both for the practitioner themselves.
 *
 * Deliberately not built (documented gaps): a VEVO integration (the spec
 * itself names this as "worth sequencing earlier" but still P1/future —
 * MoratoriumStatus rows are recorded by staff, not fetched automatically);
 * EnglishLanguageTestResult as its own entity (ENGLISH_LANGUAGE_TEST_IELTS
 * reuses the generic CredentialDefinition/PractitionerCredential shape
 * instead, which already supports a POINT_IN_TIME validity model).
 */
import type { FastifyInstance } from "fastify";
import { registerWorkforceAccessRoutes } from "./routes.js";

export function registerWorkforceAccessModule(app: FastifyInstance) {
  registerWorkforceAccessRoutes(app);
}
