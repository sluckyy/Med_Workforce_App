/**
 * Reference data only — no practitioner/organisation/user rows. Safe to run
 * against any environment; every write is an idempotent upsert keyed on a
 * stable natural code, not a demo-data generator.
 */
import { PrismaClient, CredentialCategory, Sensitivity } from "@prisma/client";

const prisma = new PrismaClient();

const CREDENTIAL_DEFINITIONS: Array<{
  code: string;
  name: string;
  category: CredentialCategory;
  issuerType?: string;
  validityModel: string;
  sensitivity?: Sensitivity;
}> = [
  {
    code: "REG_AHPRA_MEDICAL",
    name: "AHPRA medical registration",
    category: CredentialCategory.REGISTRATION,
    issuerType: "AHPRA",
    validityModel: "EXPLICIT_EXPIRY",
  },
  {
    code: "CHECK_NATIONAL_POLICE",
    name: "National police check",
    category: CredentialCategory.CHECKS,
    validityModel: "EXPLICIT_EXPIRY",
    sensitivity: Sensitivity.SENSITIVE_IDENTITY,
  },
  {
    code: "CHECK_WORKING_WITH_CHILDREN",
    name: "Working with children check",
    category: CredentialCategory.CHECKS,
    validityModel: "EXPLICIT_EXPIRY",
    sensitivity: Sensitivity.SENSITIVE_IDENTITY,
  },
  {
    code: "TRAINING_ALS",
    name: "Advanced Life Support (ALS2)",
    category: CredentialCategory.TRAINING,
    validityModel: "EXPLICIT_EXPIRY",
  },
  {
    code: "MANDATORY_LEARNING_HAND_HYGIENE",
    name: "Hand hygiene mandatory learning",
    category: CredentialCategory.MANDATORY_LEARNING,
    validityModel: "CALCULATED_RENEWAL",
  },
  {
    code: "IMMIGRATION_WORK_RIGHTS_VISA",
    name: "Visa work rights evidence",
    category: CredentialCategory.IMMIGRATION_WORK_RIGHTS,
    validityModel: "EXPLICIT_EXPIRY",
    sensitivity: Sensitivity.RESTRICTED,
  },
  {
    code: "ENGLISH_LANGUAGE_TEST_IELTS",
    name: "IELTS (or equivalent) English language test",
    category: CredentialCategory.ENGLISH_LANGUAGE_TEST,
    validityModel: "POINT_IN_TIME",
  },
];

async function main() {
  for (const def of CREDENTIAL_DEFINITIONS) {
    await prisma.credentialDefinition.upsert({
      where: { code: def.code },
      create: {
        code: def.code,
        name: def.name,
        category: def.category,
        issuerType: def.issuerType,
        validityModel: def.validityModel,
        sensitivity: def.sensitivity ?? Sensitivity.STANDARD,
      },
      update: {
        name: def.name,
        category: def.category,
        issuerType: def.issuerType,
        validityModel: def.validityModel,
        sensitivity: def.sensitivity ?? Sensitivity.STANDARD,
      },
    });
  }
  console.log(`Seeded ${CREDENTIAL_DEFINITIONS.length} credential definitions.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
