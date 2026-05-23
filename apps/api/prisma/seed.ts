import { PrismaClient } from "@prisma/client";
import { seedDatabase } from "../src/services/seedDatabase.js";

const prisma = new PrismaClient();

async function main() {
  const result = await seedDatabase(prisma);
  console.log(
    `✅ Reseeded coordinator + ${result.responderCount} responders + ${result.incidentCount} demo incidents.`,
  );
  console.log("   Coverage: Port Harcourt, Nsukka (UNN), Enugu (Airport/GRA), Yaba Phase 1 + Ikeja (Lagos).");
  console.log("   Coordinator login → phone +2348000000001 / password resq-demo-2026");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
