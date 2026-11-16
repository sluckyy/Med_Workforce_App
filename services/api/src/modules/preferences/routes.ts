import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../prisma.js";
import { recordAuditEvent } from "../audit/index.js";

const DIMENSIONS = [
  "SITE", "REGION", "ROLE", "RATE", "TRAVEL", "ACCOMMODATION", "AGENCY_RELATIONSHIP", "DELIVERY_MODE", "NOTIFICATION",
] as const;

const createPreferenceBody = z.object({
  dimension: z.enum(DIMENSIONS),
  targetId: z.string().min(1).optional(),
  value: z.record(z.unknown()).optional(),
});

const createAvailabilityBody = z
  .object({
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    status: z.enum(["AVAILABLE", "UNAVAILABLE", "TENTATIVE"]).default("AVAILABLE"),
  })
  .refine((b) => b.endAt > b.startAt, { message: "endAt must be after startAt" });

function requirePractitioner(request: { authUser?: { practitionerId: string | null } | null }) {
  return request.authUser?.practitionerId ?? null;
}

export function registerPreferencesRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------
  // Preferences. Only ever read back by the owning practitioner — no
  // staff or organisation route returns these, which is what keeps a
  // RATE floor confidential rather than a negotiating signal.
  // -------------------------------------------------------------------
  app.get("/v1/practitioners/me/preferences", { preHandler: app.authenticate }, async (request, reply) => {
    const practitionerId = requirePractitioner(request);
    if (!practitionerId) return reply.code(403).send({ error: "Forbidden" });
    const prefs = await prisma.practitionerPreference.findMany({
      where: { practitionerId, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
      orderBy: [{ dimension: "asc" }, { effectiveFrom: "desc" }],
    });
    reply.send(prefs.map((p) => ({ id: p.id, dimension: p.dimension, targetId: p.targetId, value: p.valueJson, effectiveFrom: p.effectiveFrom })));
  });

  app.post("/v1/practitioners/me/preferences", { preHandler: app.authenticate }, async (request, reply) => {
    const practitionerId = requirePractitioner(request);
    if (!practitionerId) return reply.code(403).send({ error: "Forbidden" });
    const parsed = createPreferenceBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });

    const pref = await prisma.practitionerPreference.create({
      data: {
        practitionerId,
        dimension: parsed.data.dimension,
        targetId: parsed.data.targetId,
        valueJson: parsed.data.value as Prisma.InputJsonValue | undefined,
      },
    });
    // Audited by dimension only — the value (e.g. a rate floor) is the
    // confidential part and has no business in an audit trail staff read.
    await recordAuditEvent(prisma, {
      eventType: "preferences.set", actorId: request.authUser!.id, resourceType: "PractitionerPreference",
      resourceId: pref.id, outcome: "success", metadata: { dimension: pref.dimension },
    });
    reply.code(201).send({ id: pref.id, dimension: pref.dimension, targetId: pref.targetId, value: pref.valueJson, effectiveFrom: pref.effectiveFrom });
  });

  // Ends a preference rather than deleting it: effectiveFrom/To exist so
  // "what did this doctor prefer when that vacancy was matched" stays
  // answerable.
  app.delete("/v1/practitioners/me/preferences/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const practitionerId = requirePractitioner(request);
    if (!practitionerId) return reply.code(403).send({ error: "Forbidden" });
    const { id } = request.params as { id: string };
    const existing = await prisma.practitionerPreference.findUnique({ where: { id } });
    if (!existing || existing.practitionerId !== practitionerId) return reply.code(404).send({ error: "Not found" });
    await prisma.practitionerPreference.update({ where: { id }, data: { effectiveTo: new Date() } });
    reply.code(204).send();
  });

  // -------------------------------------------------------------------
  // Availability. An UNAVAILABLE block is what the AVAILABILITY
  // eligibility evaluator checks a vacancy window against (see
  // modules/eligibility/evaluators.ts) — this is the doctor's side of
  // that gate, not a calendar for its own sake.
  // -------------------------------------------------------------------
  app.get("/v1/practitioners/me/availability", { preHandler: app.authenticate }, async (request, reply) => {
    const practitionerId = requirePractitioner(request);
    if (!practitionerId) return reply.code(403).send({ error: "Forbidden" });
    const blocks = await prisma.availability.findMany({ where: { practitionerId }, orderBy: { startAt: "asc" } });
    reply.send(blocks.map((b) => ({ id: b.id, startAt: b.startAt, endAt: b.endAt, status: b.status })));
  });

  app.post("/v1/practitioners/me/availability", { preHandler: app.authenticate }, async (request, reply) => {
    const practitionerId = requirePractitioner(request);
    if (!practitionerId) return reply.code(403).send({ error: "Forbidden" });
    const parsed = createAvailabilityBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
    const block = await prisma.availability.create({ data: { practitionerId, ...parsed.data } });
    await recordAuditEvent(prisma, {
      eventType: "preferences.availability.set", actorId: request.authUser!.id, resourceType: "Availability",
      resourceId: block.id, outcome: "success", metadata: { status: block.status },
    });
    reply.code(201).send({ id: block.id, startAt: block.startAt, endAt: block.endAt, status: block.status });
  });

  app.delete("/v1/practitioners/me/availability/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const practitionerId = requirePractitioner(request);
    if (!practitionerId) return reply.code(403).send({ error: "Forbidden" });
    const { id } = request.params as { id: string };
    const existing = await prisma.availability.findUnique({ where: { id } });
    if (!existing || existing.practitionerId !== practitionerId) return reply.code(404).send({ error: "Not found" });
    await prisma.availability.delete({ where: { id } });
    reply.code(204).send();
  });
}
