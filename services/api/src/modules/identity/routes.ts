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
} from "./tokens.js";

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
      include: { memberships: { where: { status: "ACTIVE" } } },
    });
    reply.send({
      id: user.id,
      email: user.email,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      displayName: user.displayName,
      practitionerId: user.practitionerId,
      memberships: user.memberships.map((m) => ({
        organisationId: m.organisationId,
        role: m.role,
      })),
    });
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
