import type { FastifyReply, FastifyRequest, FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma, CredentialStatus } from "@prisma/client";
import { prisma } from "../../prisma.js";
import { recordAuditEvent } from "../audit/index.js";

// Every route below this point is the practitioner acting on their own
// record — viewing another practitioner's full passport belongs to
// modules/assurance or modules/scope, not here. The one exception is the
// staff-facing practitioner lookup right below: any organisation staff
// member can resolve an email to a practitioner id (name + email only,
// nothing sensitive), because modules/scope's issue-a-grant and other
// staff workflows need a way to find who they're acting on.
function requirePractitioner(request: FastifyRequest, reply: FastifyReply) {
  if (!request.authUser?.practitionerId) {
    reply.code(403).send({ error: "Forbidden" });
    return false;
  }
  return true;
}

const updateProfileBody = z
  .object({
    displayName: z.string().min(1).optional(),
    legalName: z.string().min(1).optional(),
    mobile: z.string().min(1).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "No fields to update" });

const declareCredentialBody = z.object({
  definitionCode: z.string().min(1),
  issuer: z.string().min(1).optional(),
  referenceNumber: z.string().min(1).optional(),
  issueDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  attributes: z.record(z.unknown()).optional(),
});

const updateCredentialBody = z
  .object({
    issuer: z.string().min(1).optional(),
    referenceNumber: z.string().min(1).optional(),
    issueDate: z.coerce.date().optional(),
    expiryDate: z.coerce.date().optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "No fields to update" });

const declareEndorsementBody = z.object({
  endorsementType: z.enum([
    "ANAESTHETICS",
    "OBSTETRICS",
    "OBSTETRICS_SURGICAL",
    "SURGERY",
    "EMERGENCY_MEDICINE",
    "MENTAL_HEALTH",
    "ADULT_INTERNAL_MEDICINE",
    "PAEDIATRICS",
    "INDIGENOUS_HEALTH",
  ]),
  awardingBody: z.string().min(1).optional(),
  awardedAt: z.coerce.date().optional(),
});

function serializeCredentialSummary(
  credential: Prisma.PractitionerCredentialGetPayload<{
    include: {
      definition: true;
      evidence: true;
      verifications: { orderBy: { verifiedAt: "desc" }; take: 1 };
    };
  }>,
) {
  const latestVerification = credential.verifications[0] ?? null;
  return {
    id: credential.id,
    definition: {
      code: credential.definition.code,
      name: credential.definition.name,
      category: credential.definition.category,
    },
    issuer: credential.issuer,
    referenceNumber: credential.referenceNumber,
    issueDate: credential.issueDate,
    expiryDate: credential.expiryDate,
    status: credential.status,
    registrationType: credential.registrationType,
    version: credential.version,
    evidenceCount: credential.evidence.length,
    latestVerification: latestVerification && {
      result: latestVerification.result,
      method: latestVerification.method,
      verifiedAt: latestVerification.verifiedAt,
    },
  };
}

export function registerPassportRoutes(app: FastifyInstance) {
  app.get("/v1/practitioners", { preHandler: app.authenticate }, async (request, reply) => {
    // Staff-only (any organisation membership qualifies — this returns
    // nothing more sensitive than the name/email the caller already typed
    // in to search for); a bare practitioner account gets 403.
    if (!request.authUser?.memberships.length) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const { email } = request.query as { email?: string };
    if (!email) {
      reply.code(400).send({ error: "email query parameter is required" });
      return;
    }
    const practitioner = await prisma.practitioner.findUnique({ where: { email } });
    if (!practitioner) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    reply.send({ id: practitioner.id, displayName: practitioner.displayName, email: practitioner.email });
  });

  app.get(
    "/v1/passport/credential-definitions",
    { preHandler: app.authenticate },
    async (_request, reply) => {
      const definitions = await prisma.credentialDefinition.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { name: "asc" },
      });
      reply.send(
        definitions.map((d) => ({
          code: d.code,
          name: d.name,
          category: d.category,
          validityModel: d.validityModel,
          sensitivity: d.sensitivity,
        })),
      );
    },
  );

  app.get("/v1/passport/me", { preHandler: app.authenticate }, async (request, reply) => {
    if (!requirePractitioner(request, reply)) return;
    const practitionerId = request.authUser!.practitionerId!;

    const [practitioner, credentials, proceduralEndorsements] = await Promise.all([
      prisma.practitioner.findUniqueOrThrow({ where: { id: practitionerId } }),
      prisma.practitionerCredential.findMany({
        where: { practitionerId },
        include: {
          definition: true,
          evidence: true,
          verifications: { orderBy: { verifiedAt: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.proceduralEndorsement.findMany({
        where: { practitionerId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    reply.send({
      practitioner: {
        id: practitioner.id,
        displayName: practitioner.displayName,
        legalName: practitioner.legalName,
        email: practitioner.email,
        mobile: practitioner.mobile,
        status: practitioner.status,
      },
      credentials: credentials.map(serializeCredentialSummary),
      proceduralEndorsements: proceduralEndorsements.map((e) => ({
        id: e.id,
        endorsementType: e.endorsementType,
        awardingBody: e.awardingBody,
        awardedAt: e.awardedAt,
        currencyStatus: e.currencyStatus,
        caseCountWindow: e.caseCountWindowJson,
      })),
    });
  });

  app.patch("/v1/passport/me", { preHandler: app.authenticate }, async (request, reply) => {
    if (!requirePractitioner(request, reply)) return;
    const parsed = updateProfileBody.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }

    const practitioner = await prisma.practitioner.update({
      where: { id: request.authUser!.practitionerId! },
      data: parsed.data,
    });

    await recordAuditEvent(prisma, {
      eventType: "passport.profile.update",
      actorId: request.authUser!.id,
      resourceType: "Practitioner",
      resourceId: practitioner.id,
      outcome: "success",
    });

    reply.send({
      id: practitioner.id,
      displayName: practitioner.displayName,
      legalName: practitioner.legalName,
      email: practitioner.email,
      mobile: practitioner.mobile,
      status: practitioner.status,
    });
  });

  // Self-declared only — a claim starts life as the practitioner's own
  // assertion (CredentialStatus.DECLARED). Turning it into CURRENT is
  // modules/assurance's job (verification), not this module's. See the
  // design invariant at the top of schema.prisma: claim, evidence and
  // verification are always separate entities.
  app.post(
    "/v1/passport/credentials",
    { preHandler: app.authenticate },
    async (request, reply) => {
      if (!requirePractitioner(request, reply)) return;
      const parsed = declareCredentialBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const { definitionCode, ...rest } = parsed.data;

      const definition = await prisma.credentialDefinition.findUnique({
        where: { code: definitionCode },
      });
      if (!definition || definition.status !== "PUBLISHED") {
        reply.code(400).send({ error: "Unknown credential type" });
        return;
      }

      const credential = await prisma.practitionerCredential.create({
        data: {
          practitionerId: request.authUser!.practitionerId!,
          definitionId: definition.id,
          issuer: rest.issuer,
          referenceNumber: rest.referenceNumber,
          issueDate: rest.issueDate,
          expiryDate: rest.expiryDate,
          attributesJson: rest.attributes as Prisma.InputJsonValue | undefined,
          status: CredentialStatus.DECLARED,
          createdBy: request.authUser!.id,
        },
        include: {
          definition: true,
          evidence: true,
          verifications: { orderBy: { verifiedAt: "desc" }, take: 1 },
        },
      });

      await recordAuditEvent(prisma, {
        eventType: "passport.credential.declare",
        actorId: request.authUser!.id,
        resourceType: "PractitionerCredential",
        resourceId: credential.id,
        outcome: "success",
        metadata: { definitionCode },
      });

      reply.code(201).send(serializeCredentialSummary(credential));
    },
  );

  app.get(
    "/v1/passport/credentials/:id",
    { preHandler: app.authenticate },
    async (request, reply) => {
      if (!requirePractitioner(request, reply)) return;
      const { id } = request.params as { id: string };

      const credential = await prisma.practitionerCredential.findUnique({
        where: { id },
        include: {
          definition: true,
          evidence: { orderBy: { createdAt: "desc" } },
          verifications: { orderBy: { verifiedAt: "desc" } },
        },
      });

      // 404 rather than 403 for someone else's credential: don't confirm
      // the id exists at all to a caller who shouldn't see it.
      if (!credential || credential.practitionerId !== request.authUser!.practitionerId) {
        reply.code(404).send({ error: "Not found" });
        return;
      }

      reply.send({
        id: credential.id,
        definition: {
          code: credential.definition.code,
          name: credential.definition.name,
          category: credential.definition.category,
        },
        issuer: credential.issuer,
        referenceNumber: credential.referenceNumber,
        issueDate: credential.issueDate,
        expiryDate: credential.expiryDate,
        status: credential.status,
        registrationType: credential.registrationType,
        attributes: credential.attributesJson,
        version: credential.version,
        createdAt: credential.createdAt,
        evidence: credential.evidence.map((e) => ({
          id: e.id,
          sourceType: e.sourceType,
          originalFilename: e.originalFilename,
          mimeType: e.mimeType,
          sizeBytes: e.sizeBytes,
          scanStatus: e.scanStatus,
          sensitivity: e.sensitivity,
          version: e.version,
          createdAt: e.createdAt,
          supersededAt: e.supersededAt,
        })),
        verifications: credential.verifications.map((v) => ({
          id: v.id,
          method: v.method,
          result: v.result,
          assuranceLevel: v.assuranceLevel,
          verifiedAt: v.verifiedAt,
          validUntil: v.validUntil,
          verifierOrgId: v.verifierOrgId,
          notes: v.notes,
        })),
        // "Dependent role readiness" (spec §9) is an eligibility-engine
        // output, not passport data — left null until modules/eligibility
        // exists rather than faked here.
        dependentRoleReadiness: null,
      });
    },
  );

  app.patch(
    "/v1/passport/credentials/:id",
    { preHandler: app.authenticate },
    async (request, reply) => {
      if (!requirePractitioner(request, reply)) return;
      const parsed = updateCredentialBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const { id } = request.params as { id: string };

      const existing = await prisma.practitionerCredential.findUnique({ where: { id } });
      if (!existing || existing.practitionerId !== request.authUser!.practitionerId) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      // Once a credential has been verified (or otherwise left DECLARED),
      // the practitioner can no longer silently edit the claimed facts —
      // that would undermine what the verification attested to. A real
      // "update after verification" flow would create a new version and
      // re-trigger assurance rather than mutate the verified row; that
      // flow doesn't exist yet, so for now the claim is simply frozen.
      if (existing.status !== CredentialStatus.DECLARED) {
        reply.code(409).send({
          error: `Cannot edit a credential once it has left DECLARED status (current: ${existing.status})`,
        });
        return;
      }

      const { attributes, ...rest } = parsed.data;
      const credential = await prisma.practitionerCredential.update({
        where: { id },
        data: {
          ...rest,
          attributesJson: attributes as Prisma.InputJsonValue | undefined,
          version: { increment: 1 },
        },
        include: {
          definition: true,
          evidence: true,
          verifications: { orderBy: { verifiedAt: "desc" }, take: 1 },
        },
      });

      await recordAuditEvent(prisma, {
        eventType: "passport.credential.update",
        actorId: request.authUser!.id,
        resourceType: "PractitionerCredential",
        resourceId: credential.id,
        outcome: "success",
      });

      reply.send(serializeCredentialSummary(credential));
    },
  );

  app.post(
    "/v1/passport/procedural-endorsements",
    { preHandler: app.authenticate },
    async (request, reply) => {
      if (!requirePractitioner(request, reply)) return;
      const parsed = declareEndorsementBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }

      const endorsement = await prisma.proceduralEndorsement.create({
        data: {
          practitionerId: request.authUser!.practitionerId!,
          endorsementType: parsed.data.endorsementType,
          awardingBody: parsed.data.awardingBody,
          awardedAt: parsed.data.awardedAt,
        },
      });

      await recordAuditEvent(prisma, {
        eventType: "passport.endorsement.declare",
        actorId: request.authUser!.id,
        resourceType: "ProceduralEndorsement",
        resourceId: endorsement.id,
        outcome: "success",
      });

      reply.code(201).send({
        id: endorsement.id,
        endorsementType: endorsement.endorsementType,
        awardingBody: endorsement.awardingBody,
        awardedAt: endorsement.awardedAt,
        currencyStatus: endorsement.currencyStatus,
      });
    },
  );
}
