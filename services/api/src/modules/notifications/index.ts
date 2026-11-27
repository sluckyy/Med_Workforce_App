import type { PrismaClient } from "@prisma/client";
import { recordAuditEvent } from "../audit/index.js";
import { emailConfigured, sendEmail } from "./email.js";

/**
 * Notifications.
 *
 * Owns: getting a link or a heads-up to the person who needs it — a share
 * recipient, a timesheet approver, a doctor with a booking to confirm.
 * Does not own: the thing being notified about; callers pass a finished
 * message and a recipient, and this module reports what happened.
 *
 * Email only, via Azure Communication Services. Every attempt is audited
 * as sent / skipped / failed with the reason — including an unexpected
 * throw anywhere in the pipeline — so "did the approver ever get the link"
 * is answerable from the audit trail and a failure is never silent. A
 * notification is never load-bearing: callers still return the raw token
 * once, exactly as before, so a send failure degrades to "staff copy the
 * link" rather than a stuck workflow — and no caller awaits delivery on
 * its own response path.
 *
 * A doctor's NOTIFICATION preference (modules/preferences) with
 * channel "none" opts them out of doctor-targeted mail; external
 * recipients (approvers, share recipients) have no preferences to consult.
 *
 * Documented gaps: email only (no SMS, so quiet hours have nothing to
 * apply to); no retry or dead-letter beyond the audit record; delivery
 * after ACS acceptance is not observed; no per-notification table — the
 * audit log is the record.
 */
export interface Notification {
  to: string | null | undefined;
  subject: string;
  body: string;
  resourceType: string;
  resourceId: string;
  actorId: string;
  // When set, the recipient is a practitioner whose NOTIFICATION preference
  // is honoured; external recipients leave this unset.
  practitionerId?: string;
}

export type NotifyStatus = "sent" | "skipped" | "failed";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function notify(prisma: PrismaClient, n: Notification): Promise<NotifyStatus> {
  const audit = async (status: NotifyStatus, detail: Record<string, unknown>) => {
    try {
      await recordAuditEvent(prisma, {
        eventType: `notification.email.${status}`,
        actorId: n.actorId,
        resourceType: n.resourceType,
        resourceId: n.resourceId,
        outcome: status === "failed" ? "failure" : "success",
        metadata: { subject: n.subject, ...detail },
      });
    } catch (err) {
      // The audit write itself failing must not mask the notification outcome.
      console.error("notification audit failed", err);
    }
    return status;
  };

  try {
    if (!n.to || !EMAIL_SHAPE.test(n.to)) {
      return audit("skipped", { reason: n.to ? "recipient is not an email address" : "no recipient given" });
    }
    if (n.practitionerId) {
      const pref = await prisma.practitionerPreference.findFirst({
        where: { practitionerId: n.practitionerId, dimension: "NOTIFICATION", OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
      });
      const channel = ((pref?.valueJson ?? {}) as Record<string, unknown>).channel;
      if (typeof channel === "string" && channel.toLowerCase() === "none") {
        return audit("skipped", { reason: "practitioner opted out of notifications" });
      }
    }
    if (!emailConfigured()) {
      return audit("skipped", { reason: "email provider not configured" });
    }
    const result = await sendEmail(n.to, n.subject, n.body);
    return result.outcome === "sent"
      ? audit("sent", { messageId: result.messageId, to: n.to })
      : audit("failed", { reason: result.reason, to: n.to });
  } catch (err) {
    return audit("failed", { reason: err instanceof Error ? err.message : String(err), to: n.to });
  }
}

// Fire-and-forget wrapper for request handlers: the response must never
// wait on, or fail because of, the email provider. notify() already
// audits every outcome, including throws, so nothing is lost here.
export function notifyInBackground(prisma: PrismaClient, n: Notification): void {
  void notify(prisma, n);
}
