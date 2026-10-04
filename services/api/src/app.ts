import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { env } from "./config/env.js";
import { prisma } from "./prisma.js";
import { registerIdentityModule } from "./modules/identity/index.js";
import { registerPassportModule } from "./modules/passport/index.js";
import { registerScopeModule } from "./modules/scope/index.js";
import { registerEligibilityModule } from "./modules/eligibility/index.js";
import { registerAssuranceModule } from "./modules/assurance/index.js";
import { registerExchangeModule } from "./modules/exchange/index.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: env.corsAllowedOrigins.length > 0 ? env.corsAllowedOrigins : true,
  });
  app.register(multipart);

  registerIdentityModule(app);
  registerPassportModule(app);
  registerScopeModule(app);
  registerEligibilityModule(app);
  registerAssuranceModule(app);
  registerExchangeModule(app);

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

  return app;
}
