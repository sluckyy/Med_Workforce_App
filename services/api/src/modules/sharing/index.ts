/**
 * Sharing & Consent bounded context.
 *
 * Owns: CredentialShare, ShareItem, ShareAccessEvent — a doctor-built,
 * self-service bundle of their own credentials/endorsements, handed to an
 * external recipient who never has a platform account at all (same
 * accountless, token-gated pattern as modules/timesheet's approval link).
 * Does not own: organisation-issued scope authority.
 *
 * See docs/spec/01-technical-architecture-data-model-v0.2.docx §4, §21.
 *
 * Status: create a share from the doctor's own credentials/procedural
 * endorsements (ownership checked, never another practitioner's), with a
 * mandatory expiry and an optional OTP gate (a 6-digit code shown to the
 * doctor exactly once, bcrypt-hashed at rest — the doctor relays it to the
 * recipient themselves, since no notification service exists). The
 * recipient link (GET /v1/shares/view/:token) is itself high-entropy and
 * hashed at rest; every open/view/download/failed attempt is recorded as
 * a ShareAccessEvent, and the doctor can read that trail back
 * (GET /v1/shares/:id/access-log) and revoke the share immediately.
 * Status flips ACTIVE -> EXPIRED lazily on the next read past expiresAt,
 * on both the doctor's list and the recipient's link, rather than needing
 * a background job.
 *
 * Deliberately not built in this slice (documented gaps, not silent
 * ones): a generated, watermarked PDF pack (the recipient view returns
 * structured JSON only, which is the "structured manifest" half of the
 * spec's "human-readable PDF pack plus structured manifest" requirement,
 * not the PDF half); a real notification channel to deliver the link/OTP
 * (the doctor copies and sends both themselves); and snapshotting the
 * bundle's contents immutably at creation time — the recipient always
 * sees the practitioner's *current* record for each included item, not a
 * frozen point-in-time copy. Immigration/visa evidence (RESTRICTED
 * sensitivity) is never auto-included by any convenience action — the
 * doctor must select it item-by-item — but nothing stops an explicit
 * choice to include it, since it's the doctor's own data to share.
 */
import type { FastifyInstance } from "fastify";
import { registerSharingRoutes } from "./routes.js";

export function registerSharingModule(app: FastifyInstance) {
  registerSharingRoutes(app);
}
