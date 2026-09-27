/**
 * Identity & Access bounded context.
 *
 * Owns: user accounts, authentication, MFA, roles, organisation membership.
 * Does not own: clinical credentials or scope (see modules/passport, modules/scope).
 *
 * See docs/spec/01-technical-architecture-data-model-v0.2.docx §4, §33.
 *
 * Status: password auth + short-lived JWT access tokens + rotating opaque
 * refresh tokens, and coarse RBAC via OrganisationMembership (§24). MFA is
 * modelled (User.mfaEnabled) but not yet enforced at login — no TOTP
 * enrollment/verification flow exists. Staff provisioning issues a
 * temporary password directly rather than an emailed invite link. Both are
 * tracked gaps, not silent omissions.
 */
import type { FastifyInstance } from "fastify";
import { registerAuth } from "./auth.js";
import { registerIdentityRoutes } from "./routes.js";

export function registerIdentityModule(app: FastifyInstance) {
  registerAuth(app);
  registerIdentityRoutes(app);
}

export type { AuthenticatedUser } from "./auth.js";
