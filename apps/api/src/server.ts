import { PrismaClient } from "@prisma/client";

import { createApp, type AppDatabase } from "./app.js";
import { readEnvironment } from "./config/env.js";

const environment = readEnvironment();
const prisma = new PrismaClient();

const database: AppDatabase = {
  async check() {
    await prisma.$queryRaw`SELECT 1`;
  },
  async findUserByEmail(email) {
    return prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        passwordHash: true,
      },
    });
  },
  async findUserById(id) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
      },
    });
  },
};

const app = createApp(database, {
  corsOrigin: environment.CORS_ORIGIN,
  jwtSecret: environment.JWT_SECRET,
  sessionTtlSeconds: environment.JWT_TTL_SECONDS,
  secureCookie:
    environment.COOKIE_SECURE ?? new URL(environment.CORS_ORIGIN).protocol === "https:",
});
const server = app.listen(environment.PORT, () => {
  console.info(`API listening on port ${environment.PORT}.`);
});

async function shutdown(signal: string) {
  console.info(`${signal} received; shutting down API.`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
