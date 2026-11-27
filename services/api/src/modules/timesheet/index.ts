/**
 * Timesheet bounded context.
 *
 * Owns: Timesheet, TimesheetVersion, ApprovalToken. Closes the loop the
 * rest of modules/exchange's Vacancy/Booking state machine leaves open —
 * nothing else ever drives Vacancy past BOOKED or Booking past CONFIRMED.
 *
 * See docs/spec/01-technical-architecture-data-model-v0.2.docx §22, §31, §33.
 *
 * Status: the doctor claims actual hours against their own CONFIRMED
 * booking and submits (DRAFT -> SUBMITTED; Booking -> WORKED, Vacancy ->
 * TIMESHEET_PENDING). Staff (MEDICAL_WORKFORCE) send it for approval,
 * which issues a random, hashed-at-rest, single-use ApprovalToken — the
 * raw token is returned exactly once, the same one-time-reveal pattern as
 * MFA backup codes — and, when the recipient is an email address, also
 * emailed to them via modules/notifications (§37's notification service).
 * The email is a convenience rather than load-bearing: if it was skipped
 * or failed (see the notification.email.* audit events) staff still have
 * the one-time link to send themselves. The external approver named by that token — who
 * never has a platform account at all, matching §24's "Timesheet
 * Approver: only token-scoped timesheet" and §33's "single-purpose token"
 * row — can APPROVE (Booking -> CLOSED, Vacancy -> COMPLETE), AMEND
 * (creates a new TimesheetVersion with their own hours, status AMENDED)
 * or REJECT (reason required). This is the ONLY code path that can ever
 * set Timesheet.status to APPROVED, which is what actually enforces
 * §31's "Timesheet cannot be APPROVED without an approval actor/token
 * event" — there is no staff-side override. The doctor can accept an
 * AMENDED version outright or resubmit a fresh claim after AMENDED or
 * REJECTED, restarting the cycle. FINANCE reconciles an APPROVED
 * timesheet with an external finance reference.
 *
 * Deliberately not built in this slice (documented gaps, not silent
 * ones): OTP/step-up assurance on the approval link itself (§33 lists it
 * as "plus OTP/risk-based assurance"), rate-limiting token guesses, and
 * any notification channel other than email (no SMS).
 */
import type { FastifyInstance } from "fastify";
import { registerTimesheetRoutes } from "./routes.js";

export function registerTimesheetModule(app: FastifyInstance) {
  registerTimesheetRoutes(app);
}
