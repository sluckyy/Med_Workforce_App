import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma.js";
import { recordAuditEvent } from "../audit/index.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_MS,
  signAccessToken,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
} from "./tokens.js";
import {
  consumeBackupCode,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCodes,
  totpQrCodeDataUrl,
  verifyTotpCode,
} from "./mfa.js";

const PASSWORD_MIN_LENGTH = 12;

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(PASSWORD_MIN_LENGTH),
  displayName: z.string().min(1),
  legalName: z.string().min(1).optional(),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshBody = z.object({
  refreshToken: z.string().min(1),
});

const addMemberBody = z.object({
  email: z.string().email(),
  temporaryPassword: z.string().min(PASSWORD_MIN_LENGTH),
  displayName: z.string().min(1),
  role: z.enum([
    "MEDICAL_WORKFORCE",
    "CREDENTIAL_OFFICER",
    "SCOPE_APPROVER",
    "AGENCY_USER",
    "SITE_LEADER",
    "PROCUREMENT",
    "FINANCE",
    "STATE_ANALYST",
    "PLATFORM_SECURITY_ADMIN",
  ]),
});

async function issueSession(userId: string, practitionerId: string | null) {
  const accessToken = signAccessToken({ sub: userId, practitionerId });
  const { token: refreshToken, tokenHash } = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return { accessToken, refreshToken };
}

export function registerIdentityRoutes(app: FastifyInstance) {
  // Doctor self-registration. Staff accounts are provisioned by an existing
  // PLATFORM_SECURITY_ADMIN via POST /v1/organisations/:organisationId/members
  // instead — see that handler for why self-serve is deliberately not
  // offered for organisation roles.
  app.post("/v1/auth/register", async (request, reply) => {
    const parsed = registerBody.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    const { email, password, displayName, legalName } = parsed.data;

    const passwordHash = await hashPassword(password);

    try {
      const { user, practitioner } = await prisma.$transaction(async (tx) => {
        const practitioner = await tx.practitioner.create({
          data: { email, displayName, legalName },
        });
        const user = await tx.user.create({
          data: { email, passwordHash, practitionerId: practitioner.id },
        });
        return { user, practitioner };
      });

      await recordAuditEvent(prisma, {
        eventType: "auth.register",
        actorId: user.id,
        resourceType: "User",
        resourceId: user.id,
        outcome: "success",
      });

      const session = await issueSession(user.id, practitioner.id);
      reply.code(201).send({
        user: { id: user.id, email: user.email, practitionerId: practitioner.id },
        ...session,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        reply.code(409).send({ error: "An account with that email already exists" });
        return;
      }
      throw err;
    }
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !passwordOk || user.status !== "ACTIVE") {
      await recordAuditEvent(prisma, {
        eventType: "auth.login",
        actorId: user?.id,
        outcome: "failure",
        metadata: { email },
      });
      // Deliberately generic: never tell the caller whether the email
      // exists, the password was wrong, or the account is disabled.
      reply.code(401).send({ error: "Invalid credentials" });
      return;
    }

    if (user.mfaEnabled) {
      // Correct password, but no session yet — the challenge token proves
      // "password was correct" without granting any access until
      // /v1/auth/mfa/login also succeeds.
      await recordAuditEvent(prisma, {
        eventType: "auth.login",
        actorId: user.id,
        outcome: "mfa_challenge",
      });
      reply.send({ mfaRequired: true, mfaChallengeToken: signMfaChallengeToken(user.id) });
      return;
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await recordAuditEvent(prisma, {
      eventType: "auth.login",
      actorId: user.id,
      outcome: "success",
    });

    const session = await issueSession(user.id, user.practitionerId);
    reply.send({
      user: { id: user.id, email: user.email, practitionerId: user.practitionerId },
      ...session,
    });
  });

  const mfaLoginBody = z.object({
    mfaChallengeToken: z.string().min(1),
    code: z.string().min(1),
  });

  app.post("/v1/auth/mfa/login", async (request, reply) => {
    const parsed = mfaLoginBody.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }

    let userId: string;
    try {
      userId = verifyMfaChallengeToken(parsed.data.mfaChallengeToken).sub;
    } catch {
      reply.code(401).send({ error: "Invalid or expired MFA challenge" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaEnabled || !user.mfaSecret || user.status !== "ACTIVE") {
      reply.code(401).send({ error: "Invalid or expired MFA challenge" });
      return;
    }

    const codeOk = await verifyTotpCode(parsed.data.code, user.mfaSecret);
    let remainingBackupCodes: string[] | null = null;
    if (!codeOk) {
      const hashedCodes = (user.mfaBackupCodesHashed as string[] | null) ?? [];
      remainingBackupCodes = await consumeBackupCode(parsed.data.code, hashedCodes);
    }

    if (!codeOk && !remainingBackupCodes) {
      await recordAuditEvent(prisma, {
        eventType: "auth.mfa.verify",
        actorId: user.id,
        outcome: "failure",
      });
      reply.code(401).send({ error: "Invalid code" });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        ...(remainingBackupCodes ? { mfaBackupCodesHashed: remainingBackupCodes } : {}),
      },
    });
    await recordAuditEvent(prisma, {
      eventType: "auth.mfa.verify",
      actorId: user.id,
      outcome: "success",
      metadata: { method: codeOk ? "totp" : "backup_code" },
    });
    await recordAuditEvent(prisma, {
      eventType: "auth.login",
      actorId: user.id,
      outcome: "success",
      metadata: { mfa: true },
    });

    const session = await issueSession(user.id, user.practitionerId);
    reply.send({
      user: { id: user.id, email: user.email, practitionerId: user.practitionerId },
      ...session,
      // Surfaced so the client can nudge the user to re-enroll once
      // they're running low — losing every backup code with an
      // inaccessible authenticator is a permanent lockout.
      remainingBackupCodes: remainingBackupCodes?.length,
    });
  });

  app.post("/v1/auth/refresh", async (request, reply) => {
    const parsed = refreshBody.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }

    const tokenHash = hashRefreshToken(parsed.data.refreshToken);
    const existing = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !existing ||
      existing.revokedAt ||
      existing.expiresAt < new Date() ||
      existing.user.status !== "ACTIVE"
    ) {
      reply.code(401).send({ error: "Invalid or expired refresh token" });
      return;
    }

    // Rotate: revoke the presented token and issue a fresh pair, so a
    // stolen-but-already-used refresh token stops working (reuse detection).
    await prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const session = await issueSession(existing.user.id, existing.user.practitionerId);
    reply.send(session);
  });

  app.post(
    "/v1/auth/logout",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const parsed = refreshBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }

      const tokenHash = hashRefreshToken(parsed.data.refreshToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash, userId: request.authUser!.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await recordAuditEvent(prisma, {
        eventType: "auth.logout",
        actorId: request.authUser!.id,
        outcome: "success",
      });

      reply.code(204).send();
    },
  );

  app.get("/v1/auth/me", { preHandler: app.authenticate }, async (request, reply) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: request.authUser!.id },
      include: {
        memberships: { where: { status: "ACTIVE" }, include: { organisation: true } },
      },
    });
    reply.send({
      id: user.id,
      email: user.email,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      displayName: user.displayName,
      practitionerId: user.practitionerId,
      // Embedding the organisation name here (rather than requiring a
      // separate "list my organisations" call) is what lets a multi-org
      // staff member's Dashboard show real names instead of raw ids.
      memberships: user.memberships.map((m) => ({
        organisationId: m.organisationId,
        organisationName: m.organisation.name,
        role: m.role,
      })),
    });
  });

  const mfaCodeBody = z.object({ code: z.string().min(1) });

  app.post("/v1/auth/mfa/enroll", { preHandler: app.authenticate }, async (request, reply) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.authUser!.id } });
    if (user.mfaEnabled) {
      reply.code(409).send({ error: "MFA is already enabled — disable it first to re-enroll" });
      return;
    }

    // Generating a fresh secret discards any prior unconfirmed enrollment
    // attempt, which is fine: mfaEnabled only flips true once /confirm
    // succeeds, so an abandoned enrollment never granted anything.
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: secret } });

    reply.send({ secret, qrCodeDataUrl: await totpQrCodeDataUrl(user.email, secret) });
  });

  app.post("/v1/auth/mfa/confirm", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = mfaCodeBody.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.authUser!.id } });
    if (user.mfaEnabled) {
      reply.code(409).send({ error: "MFA is already enabled" });
      return;
    }
    if (!user.mfaSecret) {
      reply.code(409).send({ error: "Call /v1/auth/mfa/enroll first" });
      return;
    }
    if (!(await verifyTotpCode(parsed.data.code, user.mfaSecret))) {
      await recordAuditEvent(prisma, {
        eventType: "auth.mfa.enable",
        actorId: user.id,
        outcome: "failure",
      });
      reply.code(401).send({ error: "Invalid code" });
      return;
    }

    const backupCodes = generateBackupCodes();
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: true, mfaBackupCodesHashed: await hashBackupCodes(backupCodes) },
    });
    await recordAuditEvent(prisma, {
      eventType: "auth.mfa.enable",
      actorId: user.id,
      outcome: "success",
    });

    // The only time these plaintext codes ever leave the server — store
    // them somewhere safe, the response won't include them again.
    reply.send({ backupCodes });
  });

  app.post("/v1/auth/mfa/disable", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = mfaCodeBody.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.authUser!.id } });
    if (!user.mfaEnabled || !user.mfaSecret) {
      reply.code(409).send({ error: "MFA is not enabled" });
      return;
    }

    // Disabling MFA is itself step-up sensitive — being logged in isn't
    // enough; a current code (or a backup code) must also be presented,
    // same bar as verifying at login.
    const codeOk = await verifyTotpCode(parsed.data.code, user.mfaSecret);
    const hashedCodes = (user.mfaBackupCodesHashed as string[] | null) ?? [];
    const backupOk = codeOk ? null : await consumeBackupCode(parsed.data.code, hashedCodes);
    if (!codeOk && !backupOk) {
      await recordAuditEvent(prisma, {
        eventType: "auth.mfa.disable",
        actorId: user.id,
        outcome: "failure",
      });
      reply.code(401).send({ error: "Invalid code" });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodesHashed: Prisma.JsonNull },
    });
    await recordAuditEvent(prisma, {
      eventType: "auth.mfa.disable",
      actorId: user.id,
      outcome: "success",
    });
    reply.code(204).send();
  });

  // Staff provisioning is admin-gated rather than self-serve: an
  // OrganisationRole (unlike the Doctor persona) grants access to other
  // people's credential/scope/commercial data, so it must be an
  // affirmative act by an existing PLATFORM_SECURITY_ADMIN, matching §33's
  // "account recovery and identity-linking are high-risk workflows and
  // require explicit audit". Setting a temporary password here (rather
  // than an emailed invite link) is a known MVP gap — see the module
  // README.
  app.post(
    "/v1/organisations/:organisationId/members",
    { preHandler: [app.authenticate, app.requireOrgRole("PLATFORM_SECURITY_ADMIN")] },
    async (request, reply) => {
      const parsed = addMemberBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const { organisationId } = request.params as { organisationId: string };
      const { email, temporaryPassword, displayName, role } = parsed.data;

      const organisation = await prisma.organisation.findUnique({
        where: { id: organisationId },
      });
      if (!organisation) {
        reply.code(404).send({ error: "Organisation not found" });
        return;
      }

      const passwordHash = await hashPassword(temporaryPassword);
      const user = await prisma.user.upsert({
        where: { email },
        create: { email, passwordHash, displayName },
        update: {},
      });

      try {
        const membership = await prisma.organisationMembership.create({
          data: { userId: user.id, organisationId, role },
        });

        await recordAuditEvent(prisma, {
          eventType: "identity.membership.create",
          actorId: request.authUser!.id,
          actingOrgId: organisationId,
          resourceType: "OrganisationMembership",
          resourceId: membership.id,
          outcome: "success",
          metadata: { targetUserId: user.id, role, displayName },
        });

        reply.code(201).send({
          userId: user.id,
          organisationId,
          role: membership.role,
          status: membership.status,
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          reply.code(409).send({ error: "That user already has this role at this organisation" });
          return;
        }
        throw err;
      }
    },
  );
}
