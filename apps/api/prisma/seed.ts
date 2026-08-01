import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Intentionally writes no product data. This proves the seed hook is wired
  // and remains idempotent until the product schema is introduced.
  await prisma.$queryRaw`SELECT 1`;
}

main()
  .then(() => {
    console.info("Prisma seed completed (no product data defined yet).");
  })
  .catch((error: unknown) => {
    console.error("Prisma seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
