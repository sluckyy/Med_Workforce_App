/**
 * Agency & Commercial bounded context.
 *
 * Owns: Agency, AgencyAgreement, AgencyProposal, SourcingException, and
 * PractitionerAgencyRelationship. Commercial terms are always versioned and
 * booking-level costs are snapshotted at engagement time — never a single
 * fixed percentage.
 * Does not own: payroll.
 *
 * See docs/spec/01-technical-architecture-data-model-v0.2.docx §4, §19.
 */
export {};
