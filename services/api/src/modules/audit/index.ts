/**
 * Audit & Events bounded context.
 *
 * Owns: the immutable AuditEvent stream. Audit records must not be editable
 * through any application API.
 * Does not own: domain state itself — this context only records that a
 * significant action happened, not the current state of the thing it acted
 * on.
 *
 * See docs/spec/01-technical-architecture-data-model-v0.2.docx §4, §26-27.
 */
export {};
