/**
 * Audit & Events bounded context.
 *
 * Owns: the immutable AuditEvent stream. Audit records must not be editable
 * through any application API.
 * Does not own: domain state itself — this context only records that a
 * significant action happened, not the current state of the thing it acted
 * on.
 *
 * See docs/spec/01-technical-architecture-data-model-v0.2.docx §4, §26-27.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

export interface AuditEventInput {
  eventType: string;
  actorId?: string;
  actingOrgId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  outcome?: string;
  correlationId?: string;
  purpose?: string;
  metadata?: Prisma.InputJsonValue;
}

// Every other bounded context appends to the stream through this one
// function rather than writing prisma.auditEvent.create itself, so the
// "immutable, no update/delete API" invariant has a single choke point to
// enforce later (e.g. a database trigger, or a write-only role).
export function recordAuditEvent(prisma: PrismaClient, input: AuditEventInput) {
  return prisma.auditEvent.create({
    data: {
      eventType: input.eventType,
      actorId: input.actorId,
      actingOrgId: input.actingOrgId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      action: input.action,
      outcome: input.outcome,
      correlationId: input.correlationId,
      purpose: input.purpose,
      metadataJson: input.metadata,
    },
  });
}
