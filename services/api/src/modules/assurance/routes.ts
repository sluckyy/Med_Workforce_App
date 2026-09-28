import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CredentialStatus } from "@prisma/client";
import { prisma } from "../../prisma.js";
import { recordAuditEvent } from "../audit/index.js";

const recordVerificationBody = z.object({
  organisationId: z.string().uuid(),
  method: z.enum(["SELF_ATTESTED", "DOCUMENT_INSPECTION", "PRIMARY_SOURCE", "API", "EMPLOYER_RECORD"]),
  result: z.enum(["VERIFIED", "PARTIAL", "FAILED", "UNABLE", "REVOKED", "SUPERSEDED"]),
  assuranceLevel: z.string().min(1).optional(),
  validUntil: z.coerce.date().optional(),
  notes: z.string().min(1).optional(),
  evidenceId: z.string().uuid().optional(),
});

function serializeCredentialForStaff(
  credential: Awaited<ReturnType<typeof loadCredentialForStaff>>,
) {
  if (!credential) return null;
  return {
    id: credential.id,
    status: credential.status,
    issuer: credential.issuer,
    referenceNumber: credential.referenceNumber,
    issueDate: credential.issueDate,
    expiryDate: credential.expiryDate,
    attributes: credential.attributesJson,
    definition: {
      code: credential.definition.code,
      name: credential.definition.name,
      category: credential.definition.category,
    },
    practitioner: {
      id: credential.practitioner.id,
      displayName: credential.practitioner.displayName,
      email: credential.practitioner.email,
    },
    evidence: credential.evidence.map((e) => ({
      id: e.id,
      sourceType: e.sourceType,
      originalFilename: e.originalFilename,
      scanStatus: e.scanStatus,
      sensitivity: e.sensitivity,
      createdAt: e.createdAt,
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
  };
}

function loadCredentialForStaff(id: string) {
  return prisma.practitionerCredential.findUnique({
    where: { id },
    include: {
      definition: true,
      practitioner: true,
      evidence: { orderBy: { createdAt: "desc" } },
      verifications: { orderBy: { verifiedAt: "desc" } },
    },
  });
}

export function registerAssuranceRoutes(app: FastifyInstance) {
  // A credentialling officer's worklist: declared claims with no VERIFIED
  // result yet, across every practitioner. Deliberately not org-scoped in
  // the URL (unlike modules/scope) — an AHPRA registration or a national
  // police check isn't tied to one facility's authority the way a
  // ScopeGrant is, and the spec's own §33 table doesn't scope verification
  // to a single organisation either.
  app.get(
    "/v1/assurance/queue",
    { preHandler: [app.authenticate, app.requireOrgRole("CREDENTIAL_OFFICER")] },
    async (_request, reply) => {
      const candidates = await prisma.practitionerCredential.findMany({
        where: { status: { in: [CredentialStatus.DECLARED] } },
        include: {
          definition: true,
          practitioner: true,
          verifications: { orderBy: { verifiedAt: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "asc" },
      });

      const pending = candidates.filter((c) => c.verifications[0]?.result !== "VERIFIED");

      reply.send(
        pending.map((c) => ({
          id: c.id,
          definition: { code: c.definition.code, name: c.definition.name, category: c.definition.category },
          practitioner: { id: c.practitioner.id, displayName: c.practitioner.displayName, email: c.practitioner.email },
          issuer: c.issuer,
          referenceNumber: c.referenceNumber,
          declaredAt: c.createdAt,
          lastVerificationResult: c.verifications[0]?.result ?? null,
        })),
      );
    },
  );

  app.get(
    "/v1/assurance/credentials/:id",
    { preHandler: [app.authenticate, app.requireOrgRole("CREDENTIAL_OFFICER")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const credential = await loadCredentialForStaff(id);
      if (!credential) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      reply.send(serializeCredentialForStaff(credential));
    },
  );

  app.post(
    "/v1/assurance/credentials/:id/verifications",
    { preHandler: [app.authenticate, app.requireOrgRole("CREDENTIAL_OFFICER")] },
    async (request, reply) => {
      const parsed = recordVerificationBody.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }
      const { id } = request.params as { id: string };
      const { organisationId, evidenceId, ...rest } = parsed.data;

      // The officer must actually hold CREDENTIAL_OFFICER at the
      // organisation they claim to be verifying on behalf of — the route-
      // level requireOrgRole only proved they hold it *somewhere*.
      const authorised = request.authUser!.memberships.some(
        (m) => m.organisationId === organisationId && m.role === "CREDENTIAL_OFFICER",
      );
      if (!authorised) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }

      const credential = await prisma.practitionerCredential.findUnique({ where: { id } });
      if (!credential) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      if (evidenceId) {
        const evidence = await prisma.credentialEvidence.findUnique({ where: { id: evidenceId } });
        if (!evidence || evidence.credentialId !== id) {
          reply.code(400).send({ error: "Evidence does not belong to this credential" });
          return;
        }
      }

      const verification = await prisma.verification.create({
        data: {
          credentialId: id,
          evidenceId,
          verifierActorId: request.authUser!.id,
          verifierOrgId: organisationId,
          ...rest,
        },
      });

      // A VERIFIED result turns the practitioner's claim into the
      // organisation-attested fact (CURRENT); REVOKED is final. Every
      // other result (FAILED, PARTIAL, UNABLE, SUPERSEDED) leaves the
      // claim's status alone — it stays correctable rather than being
      // silently downgraded, and modules/eligibility already treats an
      // unresolved verification as UNKNOWN via the latest Verification
      // row, not via PractitionerCredential.status alone.
      if (rest.result === "VERIFIED") {
        const stillCurrent = !credential.expiryDate || credential.expiryDate >= new Date();
        await prisma.practitionerCredential.update({
          where: { id },
          data: { status: stillCurrent ? CredentialStatus.CURRENT : CredentialStatus.EXPIRED },
        });
      } else if (rest.result === "REVOKED") {
        await prisma.practitionerCredential.update({
          where: { id },
          data: { status: CredentialStatus.REVOKED },
        });
      }

      await recordAuditEvent(prisma, {
        eventType: "assurance.verification.record",
        actorId: request.authUser!.id,
        actingOrgId: organisationId,
        resourceType: "PractitionerCredential",
        resourceId: id,
        outcome: "success",
        metadata: { result: rest.result, method: rest.method },
      });

      reply.code(201).send(verification);
    },
  );
}
