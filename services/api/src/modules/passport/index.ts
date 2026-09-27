/**
 * Practitioner Passport bounded context.
 *
 * Owns: practitioner profile, identifiers, credentials, evidence references,
 * procedural endorsements (docs/addendum/v0.3-addendum.md §3).
 * Does not own: organisation scope decisions (see modules/scope), verification
 * assurance activity (see modules/assurance).
 *
 * See docs/spec/01-technical-architecture-data-model-v0.2.docx §4, §9.
 *
 * Status: the practitioner's own view and self-declaration of their
 * credentials and procedural endorsements — GET/PATCH /v1/passport/me,
 * declare/edit a credential claim, list published credential definitions.
 * A credential starts and stays CredentialStatus.DECLARED here; turning it
 * CURRENT is modules/assurance's job, not implemented yet. Evidence upload
 * (CredentialEvidence with sourceType UPLOAD) is not implemented — no
 * object storage is provisioned yet (see README "Status" and
 * infra/azure/main.bicep's comment on the same gap) — so evidence is
 * read-only here (always empty for a freshly declared credential).
 */
import type { FastifyInstance } from "fastify";
import { registerPassportRoutes } from "./routes.js";

export function registerPassportModule(app: FastifyInstance) {
  registerPassportRoutes(app);
}
