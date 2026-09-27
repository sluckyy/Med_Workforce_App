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
 */
export {};
