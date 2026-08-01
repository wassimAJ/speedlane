import { PrismaClient } from "@prisma/client";

import { createApp, type AppDatabase } from "./app.js";
import {
  findActiveGenres,
  findCatalogueBookById,
  findCatalogueBooks,
} from "./catalogue/database.js";
import { readEnvironment } from "./config/env.js";
import { findPublicBookPreviews } from "./discovery/database.js";
import {
  findFavouriteGenres,
  findForYourShelves,
  findReadingList,
  removeReadingListEntry,
  replaceFavouriteGenres,
  upsertReadingListEntry,
} from "./engagement/database.js";

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
  async findPublicBookPreviews() {
    return findPublicBookPreviews(prisma);
  },
  async findCatalogueBooks(query) {
    return findCatalogueBooks(prisma, query);
  },
  async findCatalogueBookById(bookId) {
    return findCatalogueBookById(prisma, bookId);
  },
  async findActiveGenres() {
    return findActiveGenres(prisma);
  },
  async findFavouriteGenres(userId) {
    return findFavouriteGenres(prisma, userId);
  },
  async replaceFavouriteGenres(userId, genreIds) {
    return replaceFavouriteGenres(prisma, userId, genreIds);
  },
  async findForYourShelves(userId) {
    return findForYourShelves(prisma, userId);
  },
  async findReadingList(userId) {
    return findReadingList(prisma, userId);
  },
  async upsertReadingListEntry(userId, bookId, status) {
    return upsertReadingListEntry(prisma, userId, bookId, status);
  },
  async removeReadingListEntry(userId, bookId) {
    return removeReadingListEntry(prisma, userId, bookId);
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
