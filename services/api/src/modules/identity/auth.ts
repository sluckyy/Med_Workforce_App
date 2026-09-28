import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { OrganisationRole } from "@prisma/client";
import { prisma } from "../../prisma.js";
import { verifyAccessToken } from "./tokens.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  practitionerId: string | null;
  memberships: { organisationId: string; role: OrganisationRole }[];
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthenticatedUser;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireOrgRole: (
      ...roles: OrganisationRole[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireOrgRoleAtParam: (
      paramName: string,
      ...roles: OrganisationRole[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// Registers the `authenticate` preHandler and `requireOrgRole` helper as
// decorators on the root app instance (not a sub-plugin), so every route in
// every module can use them regardless of Fastify's encapsulation contexts.
export function registerAuth(app: FastifyInstance) {
  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    let claims;
    try {
      claims = verifyAccessToken(header.slice("Bearer ".length));
    } catch {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    // Re-read status/memberships from the database on every request rather
    // than trusting the token body, so disabling a user or changing their
    // roles takes effect immediately instead of waiting for the (short)
    // access token to expire.
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      include: { memberships: { where: { status: "ACTIVE" } } },
    });

    if (!user || user.status !== "ACTIVE") {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    request.authUser = {
      id: user.id,
      email: user.email,
      practitionerId: user.practitionerId,
      memberships: user.memberships.map((m) => ({
        organisationId: m.organisationId,
        role: m.role,
      })),
    };
  });

  app.decorate("requireOrgRole", (...roles: OrganisationRole[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const hasRole = request.authUser?.memberships.some((m) => roles.includes(m.role));
      if (!hasRole) {
        reply.code(403).send({ error: "Forbidden" });
      }
    };
  });

  // Unlike requireOrgRole (true if the role holds at ANY organisation),
  // this checks the role holds specifically at the organisation named by
  // request.params[paramName] — required for any org-scoped write (e.g. a
  // CREDENTIAL_OFFICER at Org A must not be able to issue a ScopeGrant at
  // Org B just because the route only checked "some CREDENTIAL_OFFICER
  // membership exists somewhere").
  app.decorate("requireOrgRoleAtParam", (paramName: string, ...roles: OrganisationRole[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const organisationId = (request.params as Record<string, string>)[paramName];
      const hasRole = request.authUser?.memberships.some(
        (m) => m.organisationId === organisationId && roles.includes(m.role),
      );
      if (!hasRole) {
        reply.code(403).send({ error: "Forbidden" });
      }
    };
  });
}
