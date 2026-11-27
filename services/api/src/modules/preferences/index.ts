import type { FastifyInstance } from "fastify";
import { registerPreferencesRoutes } from "./routes.js";

/**
 * Practitioner Preferences bounded context.
 *
 * Owns: PractitionerPreference (sites/roles and exclusions, confidential
 * rate floors, travel, accommodation, agency relationships, delivery mode,
 * notification channels) and Availability.
 * Does not own: matching or eligibility. modules/exchange reads these to
 * mark an open vacancy excluded (a SITE/ROLE the doctor said no to) or
 * preferred (delivery mode matches) — advisory only, it never changes the
 * eligibility verdict. The one hard link into eligibility is that an
 * UNAVAILABLE Availability block fails the AVAILABILITY evaluator for an
 * overlapping vacancy window. modules/notifications honours a NOTIFICATION
 * preference with channel "none" as an opt-out of doctor-targeted email.
 *
 * INVARIANT: preferences are only ever returned to the owning practitioner.
 * No staff, organisation or agency route reads them, so a RATE floor stays
 * a private floor rather than a negotiating signal, and audit events record
 * the dimension touched but never the value.
 *
 * Documented gaps: Availability.recurrenceJson is stored but not expanded
 * (only explicit blocks are checked); SITE/ROLE targets are free text
 * matched by name or code, not a referential join; REGION, RATE, TRAVEL and
 * ACCOMMODATION have nothing on a Vacancy to match against yet; NOTIFICATION
 * quiet hours have no effect because email is the only channel.
 */
export function registerPreferencesModule(app: FastifyInstance) {
  registerPreferencesRoutes(app);
}
