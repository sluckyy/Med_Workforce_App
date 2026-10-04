import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../prisma.js";
import { recordAuditEvent } from "../audit/index.js";
import { buildObjectKey, deleteEvidence, getEvidenceDownloadUrl, uploadEvidence } from "./storage.js";

const MAX_EVIDENCE_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const DOWNLOAD_URL_TTL_SECONDS = 300;

function serializeEvidence(evidence: {
  id: string;
  sourceType: string;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  scanStatus: string;
  sensitivity: string;
  version: number;
  createdAt: Date;
  supersededAt: Date | null;
}) {
  return {
    id: evidence.id,
    sourceType: evidence.sourceType,
    originalFilename: evidence.originalFilename,
    mimeType: evidence.mimeType,
    sizeBytes: evidence.sizeBytes,
    scanStatus: evidence.scanStatus,
    sensitivity: evidence.sensitivity,
    version: evidence.version,
    createdAt: evidence.createdAt,
    supersededAt: evidence.supersededAt,
  };
}

export function registerEvidenceRoutes(app: FastifyInstance) {
  // Attaches a file to an existing credential claim as supporting
  // evidence. Does not require the credential to still be DECLARED —
  // adding more evidence is always allowed, unlike editing the claimed
  // facts (PATCH .../credentials/:id, which freezes once verified).
  app.post(
    "/v1/passport/credentials/:id/evidence",
    { preHandler: app.authenticate },
    async (request, reply) => {
      if (!request.authUser?.practitionerId) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { id } = request.params as { id: string };

      const credential = await prisma.practitionerCredential.findUnique({ where: { id } });
      if (!credential || credential.practitionerId !== request.authUser.practitionerId) {
        reply.code(404).send({ error: "Not found" });
        return;
      }

      const file = await request.file({
        limits: { fileSize: MAX_EVIDENCE_BYTES },
        throwFileSizeLimit: true,
      });
      if (!file) {
        reply.code(400).send({ error: "No file provided" });
        return;
      }
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        reply.code(400).send({ error: `Unsupported file type: ${file.mimetype}` });
        return;
      }

      let buffer: Buffer;
      try {
        buffer = await file.toBuffer();
      } catch (err) {
        if (err instanceof Error && err.message.includes("request file too large")) {
          reply.code(413).send({ error: "File exceeds the 15MB limit" });
          return;
        }
        throw err;
      }

      const objectKey = buildObjectKey(credential.practitionerId, credential.id, file.filename);
      await uploadEvidence(objectKey, buffer, file.mimetype);
      const sha256 = createHash("sha256").update(buffer).digest("hex");

      // scanStatus is left at its default (PENDING) — no malware/AV
      // scanning pipeline exists yet, so nothing here ever promotes it to
      // CLEAN. A documented gap (see modules/passport/index.ts), not a
      // silent one: assurance staff reviewing evidence can see PENDING and
      // should treat an unscanned file with appropriate caution.
      const evidence = await prisma.credentialEvidence.create({
        data: {
          credentialId: credential.id,
          sourceType: "UPLOAD",
          objectKey,
          originalFilename: file.filename,
          mimeType: file.mimetype,
          sizeBytes: buffer.length,
          sha256,
          createdBy: request.authUser.id,
        },
      });

      await recordAuditEvent(prisma, {
        eventType: "passport.evidence.upload",
        actorId: request.authUser.id,
        resourceType: "CredentialEvidence",
        resourceId: evidence.id,
        outcome: "success",
        metadata: { credentialId: credential.id, mimeType: file.mimetype, sizeBytes: buffer.length },
      });

      reply.code(201).send(serializeEvidence(evidence));
    },
  );

  // A short-lived, read-only SAS URL rather than proxying bytes through
  // this process. Available to the owning practitioner, or any staff
  // member holding CREDENTIAL_OFFICER (same not-org-scoped RBAC as the
  // rest of modules/assurance — see assurance/routes.ts's queue endpoint).
  app.get(
    "/v1/passport/credentials/:id/evidence/:evidenceId/download",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id, evidenceId } = request.params as { id: string; evidenceId: string };

      const evidence = await prisma.credentialEvidence.findUnique({
        where: { id: evidenceId },
        include: { credential: true },
      });
      // 404 rather than 403 for someone else's evidence — same reasoning
      // as GET /v1/passport/credentials/:id: don't confirm it exists.
      if (!evidence || evidence.credentialId !== id || !evidence.objectKey) {
        reply.code(404).send({ error: "Not found" });
        return;
      }

      const isOwner = evidence.credential.practitionerId === request.authUser!.practitionerId;
      const isCredentialOfficer = request.authUser!.memberships.some((m) => m.role === "CREDENTIAL_OFFICER");
      if (!isOwner && !isCredentialOfficer) {
        reply.code(404).send({ error: "Not found" });
        return;
      }

      const url = await getEvidenceDownloadUrl(evidence.objectKey);

      await recordAuditEvent(prisma, {
        eventType: "passport.evidence.download",
        actorId: request.authUser!.id,
        resourceType: "CredentialEvidence",
        resourceId: evidence.id,
        outcome: "success",
        metadata: { ownRecord: isOwner },
      });

      reply.send({ url, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS });
    },
  );

  // Mirrors the "frozen once verified" rule from PATCH .../credentials/:id:
  // once a Verification has been recorded against this evidence, deleting
  // it would retroactively undermine what was attested to, so it's blocked
  // the same way editing the claim itself is blocked.
  app.delete(
    "/v1/passport/credentials/:id/evidence/:evidenceId",
    { preHandler: app.authenticate },
    async (request, reply) => {
      if (!request.authUser?.practitionerId) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { id, evidenceId } = request.params as { id: string; evidenceId: string };

      const evidence = await prisma.credentialEvidence.findUnique({
        where: { id: evidenceId },
        include: { credential: true, verifications: true },
      });
      if (
        !evidence ||
        evidence.credentialId !== id ||
        evidence.credential.practitionerId !== request.authUser.practitionerId
      ) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      if (evidence.credential.status !== "DECLARED") {
        reply.code(409).send({ error: "Cannot delete evidence once the credential has left DECLARED status" });
        return;
      }
      if (evidence.verifications.length > 0) {
        reply.code(409).send({ error: "Cannot delete evidence already referenced by a verification" });
        return;
      }

      if (evidence.objectKey) {
        await deleteEvidence(evidence.objectKey);
      }
      await prisma.credentialEvidence.delete({ where: { id: evidenceId } });

      await recordAuditEvent(prisma, {
        eventType: "passport.evidence.delete",
        actorId: request.authUser.id,
        resourceType: "CredentialEvidence",
        resourceId: evidenceId,
        outcome: "success",
        metadata: { credentialId: id },
      });

      reply.code(204).send();
    },
  );
}
