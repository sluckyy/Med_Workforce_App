/**
 * Scope & Requirements bounded context.
 *
 * Owns: ScopeGrant, RoleTemplate, RequirementSet, Requirement, policy
 * versions, and (docs/addendum/v0.3-addendum.md §2) AreaOfNeedDetermination
 * and MoratoriumStatus — both modelled the same way as ScopeGrant:
 * organisation-issued, facility/position-specific, never inferred from a
 * determination issued elsewhere.
 * Does not own: practitioner-owned evidence (see modules/passport).
 *
 * INVARIANT: ScopeGrant is always organisation-issued and never
 * practitioner-editable. Never infer scope at one organisation from a grant
 * issued by another.
 *
 * See docs/spec/01-technical-architecture-data-model-v0.2.docx §4, §11-13.
 *
 * Status: RoleTemplate/RequirementSet authoring (draft, publish — only one
 * PUBLISHED requirement set per role template at a time) and ScopeGrant
 * issue/suspend/withdraw, all scoped to the acting user's membership at the
 * specific organisation in the URL (not "any org" — see
 * modules/identity/auth.ts's requireOrgRoleAtParam). Also includes a
 * minimal Facility create/list, standing in for the not-yet-built
 * Organisation & Service context (ScopeGrantFacility needs real facility
 * rows to reference). AreaOfNeedDetermination and MoratoriumStatus are not
 * implemented yet — the AREA_OF_NEED, MORATORIUM_LOCATION and
 * VISA_WORK_RIGHTS requirement types resolve UNKNOWN in modules/eligibility
 * until they are.
 */
import type { FastifyInstance } from "fastify";
import { registerScopeRoutes } from "./routes.js";

export function registerScopeModule(app: FastifyInstance) {
  registerScopeRoutes(app);
}
