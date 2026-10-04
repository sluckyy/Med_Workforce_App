/**
 * Workforce Exchange bounded context.
 *
 * Owns: Vacancy, Candidate, Booking, Placement (docs/addendum/v0.3-addendum.md
 * §3 — the aggregate above Booking for non-contiguous block/on-call
 * engagements such as rural generalist procedural coverage).
 * Does not own: credential authority or scope decisions (eligibility gates
 * this context's transitions but is computed by modules/eligibility).
 *
 * RoleTemplate.deliveryMode / Vacancy.deliveryMode (docs/addendum/
 * v0.3-addendum.md §4) distinguish IN_PERSON, TELEHEALTH_SYNCHRONOUS and
 * HYBRID — the vacancy/booking/eligibility workflow is identical across
 * modes; only the requirement set and travel/accommodation fields differ.
 *
 * See docs/spec/01-technical-architecture-data-model-v0.2.docx §4, §17-18.
 *
 * Status: the core loop — create a Vacancy (draft -> approve -> open for
 * candidates), a practitioner applies, staff runs a real *persisted*
 * EligibilityAssessment against it (this is what modules/eligibility's
 * stateless /evaluate endpoint was missing — see its module doc), staff
 * selects an ELIGIBLE candidate (never any other status — enforced, not
 * just conventional) which creates a Booking, and the practitioner
 * confirms it. Selecting an AGENCY-sourced candidate also snapshots that
 * agency's current commercial terms onto the Booking and marks its
 * AgencyProposal ACCEPTED (modules/commercial owns the proposal/agreement
 * rows; this is the one moment this module reaches into them, since the
 * engagement — and so the snapshot — happens here). A selection can
 * optionally link the resulting Booking to an existing Placement (the
 * addendum's non-contiguous block-booking aggregate; Placement CRUD
 * itself lives in modules/commercial). No SourcingPolicy/SourcingRun
 * staged-audience cascade (direct vs. panel-agency-first timing) — left
 * as a gap, documented in modules/commercial's doc comment.
 */
import type { FastifyInstance } from "fastify";
import { registerExchangeRoutes } from "./routes.js";

export function registerExchangeModule(app: FastifyInstance) {
  registerExchangeRoutes(app);
}
