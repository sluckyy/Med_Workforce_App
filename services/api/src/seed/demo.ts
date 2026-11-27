/**
 * Demo data: one LHN with a facility, three staff accounts, a doctor with a
 * populated passport and preferences, role templates (one with a published
 * requirement set, one without, so INDETERMINATE shows up), open vacancies,
 * and a worked booking so the timesheet and feedback loops have something
 * to show.
 *
 * Explicitly opt-in: runs only when DEMO_SEED=true, and requires
 * DEMO_SEED_PASSWORD (never a default). Idempotent — every row is looked up
 * by a stable natural key first — so it is safe to leave enabled on a demo
 * environment and re-run on every start (see docker/start.sh). It is NOT
 * for a real pilot tenant: it creates accounts with a shared password.
 */
import { PrismaClient, type OrganisationRole } from "@prisma/client";
import { hashPassword } from "../modules/identity/password.js";

const ORG_NAME = "Demo Country Health LHN";
const FACILITY = { code: "DEMO-RGH", name: "Demo Regional General Hospital" };
const DOMAIN = "demo.medworkforce.local";
export const DEMO_ACCOUNTS = {
  doctor: `dr.demo@${DOMAIN}`,
  workforce: `workforce@${DOMAIN}`,
  credentialOfficer: `credentials@${DOMAIN}`,
  scopeApprover: `scope@${DOMAIN}`,
};

const days = (n: number, hour = 8) => {
  const d = new Date();
  d.setUTCHours(hour, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};

export async function seedDemo(prisma: PrismaClient) {
  const password = process.env.DEMO_SEED_PASSWORD;
  if (!password) throw new Error("DEMO_SEED=true requires DEMO_SEED_PASSWORD");
  const passwordHash = await hashPassword(password);

  const org =
    (await prisma.organisation.findFirst({ where: { name: ORG_NAME } })) ??
    (await prisma.organisation.create({ data: { type: "LHN", name: ORG_NAME } }));
  const facility =
    (await prisma.facility.findFirst({ where: { organisationId: org.id, code: FACILITY.code } })) ??
    (await prisma.facility.create({ data: { organisationId: org.id, ...FACILITY } }));

  async function staff(email: string, role: OrganisationRole) {
    const user = await prisma.user.upsert({ where: { email }, create: { email, passwordHash }, update: { passwordHash } });
    const membership = await prisma.organisationMembership.findFirst({ where: { userId: user.id, organisationId: org.id, role } });
    if (!membership) await prisma.organisationMembership.create({ data: { userId: user.id, organisationId: org.id, role } });
    return user;
  }
  const workforce = await staff(DEMO_ACCOUNTS.workforce, "MEDICAL_WORKFORCE");
  await staff(DEMO_ACCOUNTS.credentialOfficer, "CREDENTIAL_OFFICER");
  await staff(DEMO_ACCOUNTS.scopeApprover, "SCOPE_APPROVER");

  const practitioner = await prisma.practitioner.upsert({
    where: { email: DEMO_ACCOUNTS.doctor },
    create: { email: DEMO_ACCOUNTS.doctor, displayName: "Dr Alex Demo", legalName: "Alexandra Demo" },
    update: {},
  });
  await prisma.user.upsert({
    where: { email: DEMO_ACCOUNTS.doctor },
    create: { email: DEMO_ACCOUNTS.doctor, passwordHash, practitionerId: practitioner.id },
    update: { passwordHash },
  });

  const defs = Object.fromEntries((await prisma.credentialDefinition.findMany()).map((d) => [d.code, d.id]));
  // AHPRA and ALS are verified so the ED vacancies read ELIGIBLE; the police
  // check is left DECLARED so the assurance queue has something to review
  // and the passport shows an unverified item.
  for (const [code, expiryInDays, verified] of [["REG_AHPRA_MEDICAL", 300, true], ["TRAINING_ALS", 45, true], ["CHECK_NATIONAL_POLICE", 400, false]] as const) {
    const exists = await prisma.practitionerCredential.findFirst({ where: { practitionerId: practitioner.id, definitionId: defs[code] } });
    if (exists) continue;
    const credential = await prisma.practitionerCredential.create({
      data: {
        practitionerId: practitioner.id,
        definitionId: defs[code],
        issuer: code.startsWith("REG") ? "Ahpra" : undefined,
        expiryDate: days(expiryInDays),
        registrationType: code.startsWith("REG") ? "GENERAL" : undefined,
        status: verified ? "CURRENT" : "DECLARED",
      },
    });
    if (verified) {
      await prisma.verification.create({
        data: { credentialId: credential.id, verifierOrgId: org.id, method: "PRIMARY_SOURCE", result: "VERIFIED", validUntil: days(expiryInDays), notes: "Demo seed" },
      });
    }
  }
  if (!(await prisma.practitionerPreference.findFirst({ where: { practitionerId: practitioner.id, dimension: "DELIVERY_MODE" } }))) {
    await prisma.practitionerPreference.create({ data: { practitionerId: practitioner.id, dimension: "DELIVERY_MODE", valueJson: { mode: "IN_PERSON" } } });
  }

  async function roleTemplate(code: string, name: string, requirements: Array<{ code: string; type: "REGISTRATION" | "TRAINING" | "AVAILABILITY"; evaluator: string; parameters?: Record<string, string> }>) {
    let rt = await prisma.roleTemplate.findFirst({ where: { ownerOrgId: org.id, code } });
    if (!rt) rt = await prisma.roleTemplate.create({ data: { ownerOrgId: org.id, code, name, status: "PUBLISHED" } });
    if (requirements.length > 0 && !rt.defaultRequirementSetId) {
      const set = await prisma.requirementSet.create({
        data: {
          roleTemplateId: rt.id,
          status: "PUBLISHED",
          approvedBy: workforce.id,
          approvedAt: new Date(),
          requirements: { create: requirements.map(({ parameters, ...r }, i) => ({ ...r, hard: true, parametersJson: parameters, sortOrder: i })) },
        },
      });
      rt = await prisma.roleTemplate.update({ where: { id: rt.id }, data: { defaultRequirementSetId: set.id } });
    }
    return rt;
  }
  const edSenior = await roleTemplate("ED_SENIOR", "ED Senior Medical Officer", [
    { code: "AHPRA", type: "REGISTRATION", evaluator: "registrationCurrent", parameters: { definitionCode: "REG_AHPRA_MEDICAL" } },
    { code: "ALS", type: "TRAINING", evaluator: "credentialCurrent", parameters: { definitionCode: "TRAINING_ALS" } },
    { code: "AVAIL", type: "AVAILABILITY", evaluator: "availableForWindow" },
  ]);
  const ruralGp = await roleTemplate("RURAL_GP_ANAES", "Rural GP Anaesthetist", []);

  if ((await prisma.vacancy.count({ where: { organisationId: org.id } })) === 0) {
    const open = (rt: string, start: number) => ({ organisationId: org.id, facilityId: facility.id, roleTemplateId: rt, startAt: days(start), endAt: days(start, 18), status: "SOURCING" as const, approvedBy: workforce.id, approvedAt: new Date() });
    await prisma.vacancy.createMany({ data: [open(edSenior.id, 7), open(edSenior.id, 14), open(ruralGp.id, 10)] });
    const worked = await prisma.vacancy.create({ data: { ...open(edSenior.id, -5), status: "WORKED" } });
    await prisma.booking.create({ data: { vacancyId: worked.id, practitionerId: practitioner.id, sourceType: "DIRECT", status: "CONFIRMED", confirmedAt: days(-7) } });
  }

  return { org: org.name, accounts: DEMO_ACCOUNTS };
}
