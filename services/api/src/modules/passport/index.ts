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
 * Verification yet).
 *
 * Every upload is scanned by a real ClamAV daemon (modules/passport/scan.ts
 * talks to clamd over its local unix socket via the INSTREAM protocol;
 * clamd itself runs as a background process in this same container — see
 * services/api/docker/{clamd.conf,freshclam.conf,start.sh}) BEFORE the
 * bytes ever reach Blob Storage. A positive detection is rejected outright
 * (HTTP 422) and recorded with no objectKey — the file itself is never
 * persisted, only the fact that someone tried to upload it. A clean file
 * is CredentialEvidence.scanStatus CLEAN; if clamd is unreachable (a cold
 * start, or an outage) the upload still proceeds but stays PENDING — never
 * silently promoted to CLEAN on a check that didn't actually happen, same
 * invariant this codebase applies everywhere else (eligibility evaluators,
 * fatigue checks, moratorium status). CREDENTIAL_OFFICER staff can retry a
 * PENDING evidence item once the scanner is back via POST
 * .../evidence/:evidenceId/rescan.
 */
import type { FastifyInstance } from "fastify";
import { registerPassportRoutes } from "./routes.js";
import { registerEvidenceRoutes } from "./evidence-routes.js";

export function registerPassportModule(app: FastifyInstance) {
  registerPassportRoutes(app);
  registerEvidenceRoutes(app);
}
