import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

// Simplified matching: the spec's AgencyAgreement.category is meant to
// scope a fee model to a kind of engagement, but neither Vacancy nor
// RoleTemplate carries a matching category field yet, so this just picks
// whichever agreement is in its effective window — a documented
// simplification, not a silent one (see modules/commercial/index.ts).
export async function findActiveAgreement(db: Db, agencyId: string, at: Date) {
  const agreements = await db.agencyAgreement.findMany({ where: { agencyId } });
  return (
    agreements.find(
      (a) => (!a.effectiveFrom || a.effectiveFrom <= at) && (!a.effectiveTo || a.effectiveTo >= at),
    ) ?? null
  );
}
