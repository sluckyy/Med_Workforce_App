/**
 * Identity & Access bounded context.
 *
 * Owns: user accounts, authentication, MFA, roles, organisation membership.
 * Does not own: clinical credentials or scope (see modules/passport, modules/scope).
 *
 * See docs/spec/01-technical-architecture-data-model-v0.2.docx §4, §33.
 *
 * Status: password auth + short-lived JWT access tokens + rotating opaque
 * refresh tokens, and coarse RBAC via OrganisationMembership (§24).
 *
 * TOTP MFA is fully wired: POST /v1/auth/mfa/enroll (issues a secret + QR
 * code), /confirm (a live code flips User.mfaEnabled and issues one-time
 * backup codes, shown exactly once), /disable (step-up: needs a current
 * code, not just an active session). When MFA is on, POST /v1/auth/login
 * returns a short-lived, single-purpose mfaChallengeToken instead of real
 * session tokens (see tokens.ts's purpose discriminator, which stops that
 * token from ever being usable as a real access token) — POST
 * /v1/auth/mfa/login exchanges it plus a TOTP or backup code for the
 * actual session. mfaSecret is stored in plaintext in the database; a
 * real deployment should envelope-encrypt it (e.g. Key Vault-wrapped DEK)
 * — documented gap, not a silent one, matching the pattern used elsewhere
 * (localStorage token storage on the frontend, no rate-limiting on MFA
 * code guesses here).
 *
 * Staff provisioning still issues a temporary password directly rather
 * than an emailed invite link — a tracked gap, not a silent one.
 */
import type { FastifyInstance } from "fastify";
import { registerAuth } from "./auth.js";
import { registerIdentityRoutes } from "./routes.js";

export function registerIdentityModule(app: FastifyInstance) {
  registerAuth(app);
  registerIdentityRoutes(app);
}

export type { AuthenticatedUser } from "./auth.js";
