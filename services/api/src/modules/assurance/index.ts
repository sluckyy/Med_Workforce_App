/**
 * Credential Assurance bounded context.
 *
 * Owns: verification activities, assurance levels, verifier provenance.
 * Does not own: the receiving organisation's trust decision (that is the
 * receiving organisation's own scope/credentialling process, not this
 * platform's to make).
 *
 * See docs/spec/01-technical-architecture-data-model-v0.2.docx §4, §10.
 *
 * Status: a credentialling officer's queue (GET /v1/assurance/queue) of
 * declared-but-unverified claims, a staff-facing credential detail view,
 * and recording a verification (POST .../verifications). A VERIFIED result
 * turns the claim into PractitionerCredential.status CURRENT (or EXPIRED if
 * already past its expiry date); REVOKED sets it REVOKED; every other
 * result leaves status alone and correctable. modules/passport's PATCH
 * already refuses further practitioner edits once status leaves DECLARED,
 * so a verified claim's facts are frozen the moment this module acts on
 * it. modules/eligibility reads the latest Verification row directly
 * (not just credential status) so an unresolved verification evaluates
 * UNKNOWN rather than optimistically passing.
 */
import type { FastifyInstance } from "fastify";
import { registerAssuranceRoutes } from "./routes.js";

export function registerAssuranceModule(app: FastifyInstance) {
  registerAssuranceRoutes(app);
}
