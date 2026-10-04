import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ShareStatus, ShareAccessEventType } from "@prisma/client";
import { prisma } from "../../prisma.js";
import { recordAuditEvent } from "../audit/index.js";
import { hashPassword, verifyPassword } from "../identity/password.js";
import { generateShareToken, hashShareToken, generateOtpCode } from "./tokens.js";

const MAX_EXPIRY_HOURS = 24 * 30; // 30 days — "mandatory, configurable short duration"

const shareItemInput = z.object({
  itemType: z.enum(["CREDENTIAL", "PROCEDURAL_ENDORSEMENT"]),
  itemId: z.string().uuid(),
});

const createShareBody = z.object({
  recipientLabel: z.string().min(1).optional(),
  recipientContact: z.string().min(1).optional(),
  expiresInHours: z.number().int().min(1).max(MAX_EXPIRY_HOURS),
  otpRequired: z.boolean().default(false),
  items: z.array(shareItemInput).min(1),
});

function serializeShare(share: { id: string; recipientLabel: string | null; recipientContact: string | null; otpRequired: boolean; expiresAt: Date; status: ShareStatus; createdAt: Date; items: { itemType: string; itemId: string }[]; accessEvents: { event: ShareAccessEventType }[] }) {
  return {
    id: share.id,
    recipientLabel: share.recipientLabel,
    recipientContact: share.recipientContact,
    otpRequired: share.otpRequired,
    expiresAt: share.expiresAt,
    status: share.status,
    createdAt: share.createdAt,
    itemCount: share.items.length,
    accessEventCount: share.accessEvents.length,
  };
}

// Lazily flips ACTIVE -> EXPIRED on read rather than running a background
// job — the doctor's own list view and the recipient's link both go
// through this, so neither can see a stale ACTIVE status past expiresAt.
async function loadShareWithLazyExpiry(id: string) {
  const share = await prisma.credentialShare.findUnique({
    where: { id },
    include: { items: true, accessEvents: true },
  });
  if (!share) return null;
  if (share.status === ShareStatus.ACTIVE && share.expiresAt < new Date()) {
    const expired = await prisma.credentialShare.update({
      where: { id },
      data: { status: ShareStatus.EXPIRED },
      include: { items: true, accessEvents: true },
    });
    return expired;
  }
  return share;
}

async function buildBundle(items: { itemType: string; itemId: string }[]) {
  const credentialIds = items.filter((i) => i.itemType === "CREDENTIAL").map((i) => i.itemId);
  const endorsementIds = items.filter((i) => i.itemType === "PROCEDURAL_ENDORSEMENT").map((i) => i.itemId);

  const [credentials, endorsements] = await Promise.all([
    credentialIds.length
      ? prisma.practitionerCredential.findMany({ where: { id: { in: credentialIds } }, include: { definition: true } })
      : [],
    endorsementIds.length ? prisma.proceduralEndorsement.findMany({ where: { id: { in: endorsementIds } } }) : [],
  ]);

  // Always the practitioner's *current* record, not a frozen snapshot of
  // what it looked like at share-creation time — a simplification worth
  // naming (see modules/sharing/index.ts): a fuller build would snapshot
  // the pack's contents immutably so a later credential edit can't change
  // what an already-issued share shows.
  return {
    credentials: credentials.map((c) => ({
      code: c.definition.code,
      name: c.definition.name,
      category: c.definition.category,
      issuer: c.issuer,
      referenceNumber: c.referenceNumber,
      issueDate: c.issueDate,
      expiryDate: c.expiryDate,
      status: c.status,
    })),
    proceduralEndorsements: endorsements.map((e) => ({
      endorsementType: e.endorsementType,
      awardingBody: e.awardingBody,
      awardedAt: e.awardedAt,
      currencyStatus: e.currencyStatus,
    })),
  };
}

export function registerSharingRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------
  // Doctor-facing: build, list, revoke, audit trail
  // -------------------------------------------------------------------
  app.post("/v1/shares", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const parsed = createShareBody.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    const practitionerId = request.authUser.practitionerId;
    const { items, expiresInHours, otpRequired, ...rest } = parsed.data;

    const credentialIds = items.filter((i) => i.itemType === "CREDENTIAL").map((i) => i.itemId);
    const endorsementIds = items.filter((i) => i.itemType === "PROCEDURAL_ENDORSEMENT").map((i) => i.itemId);
    const [ownedCredentials, ownedEndorsements] = await Promise.all([
      credentialIds.length
        ? prisma.practitionerCredential.findMany({ where: { id: { in: credentialIds }, practitionerId } })
        : [],
      endorsementIds.length
        ? prisma.proceduralEndorsement.findMany({ where: { id: { in: endorsementIds }, practitionerId } })
        : [],
    ]);
    if (ownedCredentials.length !== credentialIds.length || ownedEndorsements.length !== endorsementIds.length) {
      reply.code(400).send({ error: "One or more items do not belong to this practitioner" });
      return;
    }

    const { token, tokenHash } = generateShareToken();
    const otpCode = otpRequired ? generateOtpCode() : null;
    const otpHash = otpCode ? await hashPassword(otpCode) : null;

    const share = await prisma.credentialShare.create({
      data: {
        practitionerId,
        tokenHash,
        otpRequired,
        otpCodeHash: otpHash,
        expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
        ...rest,
        items: { create: items.map((i) => ({ itemType: i.itemType, itemId: i.itemId })) },
      },
      include: { items: true, accessEvents: true },
    });

    await recordAuditEvent(prisma, {
      eventType: "sharing.share.create",
      actorId: request.authUser.id,
      resourceType: "CredentialShare",
      resourceId: share.id,
      outcome: "success",
      metadata: { itemCount: items.length, otpRequired },
    });

    // The raw token (and OTP code, if any) are returned exactly once —
    // same one-time-reveal pattern as MFA backup codes and the timesheet
    // approval token — and never persisted in plaintext.
    reply.code(201).send({ ...serializeShare(share), shareToken: token, otpCode });
  });

  app.get("/v1/shares/me", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const shares = await prisma.credentialShare.findMany({
      where: { practitionerId: request.authUser.practitionerId },
      include: { items: true, accessEvents: true },
      orderBy: { createdAt: "desc" },
    });
    reply.send(shares.map(serializeShare));
  });

  app.post("/v1/shares/:id/revoke", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const { id } = request.params as { id: string };
    const share = await prisma.credentialShare.findUnique({ where: { id } });
    if (!share || share.practitionerId !== request.authUser.practitionerId) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    if (share.status !== ShareStatus.ACTIVE) {
      reply.code(409).send({ error: `Share is ${share.status}, not ACTIVE` });
      return;
    }

    await prisma.credentialShare.update({ where: { id }, data: { status: ShareStatus.REVOKED } });

    await recordAuditEvent(prisma, {
      eventType: "sharing.share.revoke",
      actorId: request.authUser.id,
      resourceType: "CredentialShare",
      resourceId: id,
      outcome: "success",
    });

    reply.code(204).send();
  });

  app.get("/v1/shares/:id/access-log", { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.authUser?.practitionerId) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const { id } = request.params as { id: string };
    const share = await prisma.credentialShare.findUnique({ where: { id } });
    if (!share || share.practitionerId !== request.authUser.practitionerId) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    const events = await prisma.shareAccessEvent.findMany({ where: { shareId: id }, orderBy: { occurredAt: "desc" } });
    reply.send(events.map((e) => ({ event: e.event, occurredAt: e.occurredAt })));
  });

  // -------------------------------------------------------------------
  // External recipient: no platform account, token-gated only — same
  // accountless pattern as modules/timesheet's approval link.
  // -------------------------------------------------------------------
  async function loadViewableShareOrNull(token: string) {
    const tokenHash = hashShareToken(token);
    const share = await prisma.credentialShare.findFirst({ where: { tokenHash } });
    if (!share) return { error: 404 as const };
    const fresh = await loadShareWithLazyExpiry(share.id);
    if (!fresh || fresh.status !== ShareStatus.ACTIVE) {
      return { error: 410 as const, shareId: share.id };
    }
    return { share: fresh };
  }

  app.get("/v1/shares/view/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const result = await loadViewableShareOrNull(token);
    if (result.error === 404) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    if (result.error === 410) {
      await recordAuditEvent(prisma, {
        eventType: "sharing.access.failed",
        resourceType: "CredentialShare",
        resourceId: result.shareId,
        outcome: "failure",
        metadata: { reason: "expired_or_revoked" },
      });
      reply.code(410).send({ error: "This share link has expired or been revoked" });
      return;
    }
    const { share } = result;

    await prisma.shareAccessEvent.create({ data: { shareId: share.id, event: ShareAccessEventType.OPEN } });

    if (share.otpRequired) {
      reply.send({ recipientLabel: share.recipientLabel, otpRequired: true });
      return;
    }

    await prisma.shareAccessEvent.create({ data: { shareId: share.id, event: ShareAccessEventType.VIEW } });
    const bundle = await buildBundle(share.items);
    reply.send({ recipientLabel: share.recipientLabel, otpRequired: false, ...bundle });
  });

  app.post("/v1/shares/view/:token/unlock", async (request, reply) => {
    const { token } = request.params as { token: string };
    const result = await loadViewableShareOrNull(token);
    if (result.error === 404) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    if (result.error === 410) {
      reply.code(410).send({ error: "This share link has expired or been revoked" });
      return;
    }
    const { share } = result;
    const parsed = z.object({ code: z.string().min(1) }).safeParse(request.body);
    if (!parsed.success || !share.otpCodeHash) {
      reply.code(400).send({ error: "Invalid request" });
      return;
    }

    const valid = await verifyPassword(parsed.data.code, share.otpCodeHash);
    if (!valid) {
      await prisma.shareAccessEvent.create({ data: { shareId: share.id, event: ShareAccessEventType.FAILED } });
      reply.code(401).send({ error: "Invalid code" });
      return;
    }

    await prisma.shareAccessEvent.create({ data: { shareId: share.id, event: ShareAccessEventType.VIEW } });
    const bundle = await buildBundle(share.items);
    reply.send({ recipientLabel: share.recipientLabel, otpRequired: false, ...bundle });
  });
}
