/**
 * Locum Experience bounded context.
 *
 * Owns: confidential post-shift survey, aggregation, improvement actions.
 * Does not own: formal incident management — a survey response indicating a
 * safety concern must be routed to the organisation's existing formal
 * reporting pathway, never treated as the incident channel itself.
 *
 * INVARIANT: routine dashboards return aggregated results only, gated by a
 * minimum-n threshold enforced in the query layer, not by dashboard
 * convention. Raw practitioner linkage is pseudonymised and restricted.
 *
 * See docs/spec/01-technical-architecture-data-model-v0.2.docx §4, §23.
 */
export {};
