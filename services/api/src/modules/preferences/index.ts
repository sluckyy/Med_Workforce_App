import type { FastifyInstance } from "fastify";
import { registerPreferencesRoutes } from "./routes.js";

/**
 * Practitioner Preferences bounded context.
 *
 * Owns: PractitionerPreference (sites/roles and exclusions, confidential
 * rate floors, travel, accommodation, agency relationships, delivery mode,
 * notification channels) and Availability.
 * Does not own: matching. Nothing here filters vacancies — preferences are
 * the doctor's own record, and the one hard link into eligibility is that
 * an UNAVAILABLE Availability block fails the AVAILABILITY evaluator for
 * an overlapping vacancy window.
 *
 * INVARIANT: preferences are only ever returned to the owning practitioner.
 * No staff, organisation or agency route reads them, so a RATE floor stays
 * a private floor rather than a negotiating signal, and audit events record
 * the dimension touched but never the value.
 *
 * Documented gaps: Availability.recurrenceJson is stored but not expanded
 * (only explicit blocks are checked); SITE/ROLE targets are free ids with
 * no referential check; NOTIFICATION preferences are recorded but no
 * notification delivery exists yet to honour them; nothing ranks or
 * excludes vacancies by preference — that is the obvious next consumer.
 */
export function registerPreferencesModule(app: FastifyInstance) {
  registerPreferencesRoutes(app);
}
