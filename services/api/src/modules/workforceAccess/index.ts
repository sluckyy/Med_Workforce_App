/**
 * Workforce Access bounded context (IMG / visa / Area of Need).
 * Added by docs/addendum/v0.3-addendum.md §2 — not present in the v0.2/v1.0
 * baseline spec.
 *
 * Owns: AreaOfNeedDetermination and MoratoriumStatus — both modelled the
 * same way as ScopeGrant (see modules/scope): organisation- or
 * Commonwealth-issued, facility/position/location-specific, never
 * practitioner-portable and never inferred from a determination issued
 * elsewhere. Also owns the IMMIGRATION_WORK_RIGHTS and
 * ENGLISH_LANGUAGE_TEST credential categories on PractitionerCredential, and
 * the registrationType field used to represent provisional/limited/
 * supervised-practice Ahpra registration.
 * Does not own: clinical scope itself (see modules/scope) — Area of Need
 * and moratorium status are additional, independent gates alongside
 * clinical eligibility, not a substitute for it.
 *
 * SENSITIVITY: immigration/visa data sits in the highest sensitivity
 * compartment — stricter than general identity evidence — and must be
 * excluded from every default CredentialShare bundle (see modules/sharing).
 */
export {};
