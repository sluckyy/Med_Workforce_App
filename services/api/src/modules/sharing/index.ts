/**
 * Sharing & Consent bounded context.
 *
 * Owns: credential bundles, share grants, external recipient access.
 * Does not own: organisation-issued scope authority.
 *
 * Sensitive identity/immigration evidence (docs/addendum/v0.3-addendum.md
 * §2) must be excluded from every default bundle template, not merely
 * unselected by default.
 *
 * See docs/spec/01-technical-architecture-data-model-v0.2.docx §4, §21.
 */
export {};
