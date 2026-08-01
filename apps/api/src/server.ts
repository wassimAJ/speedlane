import { PrismaClient } from "@prisma/client";

import { createApp, type DatabaseHealthcheck } from "./app.js";
import { readEnvironment } from "./config/env.js";

const environment = readEnvironment();
const prisma = new PrismaClient();

const database: DatabaseHealthcheck = {
  async check() {
    await prisma.$queryRaw`SELECT 1`;
  },
};

const app = createApp(database);
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
