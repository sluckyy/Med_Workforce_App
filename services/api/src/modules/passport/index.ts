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
 * CURRENT is modules/assurance's job.
 *
 * Evidence upload is wired to Azure Blob Storage (modules/passport/storage.ts):
 * POST .../credentials/:id/evidence (multipart, 15MB cap, PDF/PNG/JPEG only),
 * GET .../evidence/:evidenceId/download (short-lived SAS URL — the browser
 * fetches the file directly from Blob Storage), DELETE (only while the
 * credential is still DECLARED and the evidence hasn't been used in a
 * Verification yet). No malware scanning pipeline exists, so
 * CredentialEvidence.scanStatus never leaves PENDING — a documented gap,
 * not a silent one.
 */
import type { FastifyInstance } from "fastify";
import { registerPassportRoutes } from "./routes.js";
import { registerEvidenceRoutes } from "./evidence-routes.js";

export function registerPassportModule(app: FastifyInstance) {
  registerPassportRoutes(app);
  registerEvidenceRoutes(app);
}
