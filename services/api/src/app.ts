import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./config/env.js";
import { prisma } from "./prisma.js";
import { registerIdentityModule } from "./modules/identity/index.js";
import { registerPassportModule } from "./modules/passport/index.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: env.corsAllowedOrigins.length > 0 ? env.corsAllowedOrigins : true,
  });

  registerIdentityModule(app);
  registerPassportModule(app);

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/health/ready", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ok" };
    } catch (err) {
      app.log.error(err);
      reply.code(503);
      return { status: "unavailable" };
    }
  });

  app.get("/v1/role-templates", async () => {
    // Placeholder for the Scope & Requirements bounded context
    // (services/api/src/modules/scope). Replace with a real query once
    // the practitioner/organisation auth model lands.
    return prisma.roleTemplate.findMany({ take: 20 });
  });

  return app;
}
