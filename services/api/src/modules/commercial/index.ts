/**
 * Agency & Commercial bounded context.
 *
 * Owns: Agency, AgencyAgreement, AgencyProposal, SourcingException,
 * PractitionerAgencyRelationship, and Placement (v0.3 addendum §3 — the
 * aggregate above Booking for non-contiguous block/on-call engagements).
 * Commercial terms are always versioned (AgencyAgreement rows, never
 * mutated in place) and booking-level costs are snapshotted at engagement
 * time onto Booking.commercialSnapshotJson — see modules/exchange's select
 * handler, which does the snapshotting since that's where the engagement
 * actually happens. Never a single live-reference percentage.
 * Does not own: payroll.
 *
 * See docs/spec/01-technical-architecture-data-model-v0.2.docx §4, §19, §25.
 *
 * Status: panel administration (register/suspend an agency, author its fee
 * agreements — PROCUREMENT), the agency-side proposal loop (browse
 * sourcing-open vacancies, submit a candidate who is already a registered
 * practitioner, withdraw), the staff-side review/decline loop, sourcing
 * exceptions, and Placement CRUD.
 *
 * Deliberately not built in this slice (documented gaps, not silent ones):
 * - SourcingPolicy/SourcingRun's staged audience cascade (direct pool vs.
 *   panel-agency-first timing) — VacancyStatus.SOURCING is used as the one
 *   stage agencies and direct applicants share, rather than adding the
 *   PANEL_AGENCY_OPEN/DIRECT_POOL_OPEN stages the spec's state machine
 *   names.
 * - AgencyAgreement.category / Agency.categoriesJson matching against a
 *   vacancy's category — neither Vacancy nor RoleTemplate carries a
 *   category field yet, so modules/commercial/agreements.ts picks
 *   whichever agreement is in its effective window rather than matching
 *   one by category.
 * - Representing a candidate who isn't yet a registered practitioner at
 *   all (the spec's "represented identity" for an unresolved external
 *   candidate) — proposal submission requires an existing Practitioner.
 * - The AN-003 agency performance dashboard (response/fill/cost rollups).
 */
import type { FastifyInstance } from "fastify";
import { registerCommercialRoutes } from "./routes.js";

export function registerCommercialModule(app: FastifyInstance) {
  registerCommercialRoutes(app);
}

export { findActiveAgreement } from "./agreements.js";
