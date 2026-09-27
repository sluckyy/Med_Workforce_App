/**
 * Timesheet bounded context.
 *
 * Owns: worked time, approval evidence (accountless approval via a
 * single-purpose, expiring, hashed-at-rest token), reconciliation status.
 * Does not own: payment processing.
 *
 * See docs/spec/01-technical-architecture-data-model-v0.2.docx §4, §22.
 */
export {};
