// Entrypoint for the demo seed (compiled into the image as dist/seed/run-demo.js
// and invoked by docker/start.sh when DEMO_SEED=true; locally: npm run seed:demo).
import { PrismaClient } from "@prisma/client";
import { seedDemo } from "./demo.js";

const prisma = new PrismaClient();
seedDemo(prisma)
  .then((r) => console.log(`Demo seed ok: ${r.org} — accounts: ${Object.values(r.accounts).join(", ")}`))
  .catch((err) => {
    console.error("Demo seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
