import { EmailClient } from "@azure/communication-email";
import { env } from "../../config/env.js";

let client: EmailClient | null | undefined;

// Lazy + memoized, same reasoning as modules/passport/storage.ts: nothing
// should touch the connection string until a send actually happens.
function getClient(): EmailClient | null {
  if (client !== undefined) return client;
  client = env.acsConnectionString && env.emailSender ? new EmailClient(env.acsConnectionString) : null;
  return client;
}

export function emailConfigured(): boolean {
  return getClient() !== null;
}

export type SendResult = { outcome: "sent"; messageId: string } | { outcome: "failed"; reason: string };

// Waits for ACS to *accept* the message (poller status Succeeded), which is
// the strongest signal available without an inbox: it's queued for
// delivery. Delivery itself (bounces, spam filtering) is not observed.
export async function sendEmail(to: string, subject: string, plainText: string): Promise<SendResult> {
  const c = getClient();
  if (!c) return { outcome: "failed", reason: "email provider not configured" };
  try {
    const poller = await c.beginSend({ senderAddress: env.emailSender, recipients: { to: [{ address: to }] }, content: { subject, plainText } });
    const result = await poller.pollUntilDone();
    if (result.status === "Succeeded") return { outcome: "sent", messageId: result.id };
    return { outcome: "failed", reason: result.error?.message ?? `provider status ${result.status}` };
  } catch (err) {
    return { outcome: "failed", reason: err instanceof Error ? err.message : "send threw" };
  }
}
