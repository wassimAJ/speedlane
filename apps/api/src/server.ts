import { PrismaClient } from "@prisma/client";

import {
  archiveAdminBook,
  archiveAdminGenre,
  createAdminBook,
  createAdminGenre,
  findAdminBooks,
  findAdminGenres,
  restoreAdminBook,
  restoreAdminGenre,
  updateAdminBook,
  updateAdminGenre,
} from "./admin/database.js";
import {
  findProfileById,
  invalidateVerificationChallenge,
  markVerificationChallengeDeliveryFailed,
  markVerificationChallengeDispatched,
  prepareReaderRegistration,
  prepareVerificationResend,
  updateProfileDisplayName,
  verifyEmailCode,
} from "./account/database.js";
import { cleanupExpiredAccountSetup } from "./account/cleanup-database.js";
import {
  startAccountSetupCleanup,
  type AccountSetupCleanupLifecycle,
} from "./account/cleanup.js";
import {
  createResendVerificationMailDelivery,
  UnavailableVerificationMailDelivery,
} from "./account/mail.js";
import type { AccountStore } from "./account/routes.js";
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

const database: AppDatabase & AccountStore = {
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
        emailVerifiedAt: true,
      },
    });
  },
  async findUserById(id) {
    return prisma.user.findFirst({
      where: { id, emailVerifiedAt: { not: null } },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        emailVerifiedAt: true,
      },
    });
  },
  async prepareReaderRegistration(registration, draft, now) {
    return prepareReaderRegistration(
      prisma,
      registration,
      draft,
      environment.JWT_SECRET,
      now,
    );
  },
  async prepareVerificationResend(email, draft, currentPendingToken, now) {
    return prepareVerificationResend(
      prisma,
      email,
      draft,
      environment.JWT_SECRET,
      currentPendingToken,
      now,
    );
  },
  async markVerificationChallengeDispatched(challengeId, dispatchedAt) {
    await markVerificationChallengeDispatched(prisma, challengeId, dispatchedAt);
  },
  async invalidateVerificationChallenge(challengeId, invalidatedAt) {
    await invalidateVerificationChallenge(prisma, challengeId, invalidatedAt);
  },
  async markVerificationChallengeDeliveryFailed(
    challengeId,
    deliveryFailedAt,
  ) {
    await markVerificationChallengeDeliveryFailed(
      prisma,
      challengeId,
      deliveryFailedAt,
    );
  },
  async verifyEmailCode(email, code, pendingToken, now) {
    return verifyEmailCode(
      prisma,
      email,
      code,
      pendingToken,
      environment.JWT_SECRET,
      now,
    );
  },
  async findProfileById(userId) {
    return findProfileById(prisma, userId);
  },
  async updateProfileDisplayName(userId, displayName) {
    return updateProfileDisplayName(prisma, userId, displayName);
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
  async findAdminBooks(status) {
    return findAdminBooks(prisma, status);
  },
  async createAdminBook(input) {
    return createAdminBook(prisma, input);
  },
  async updateAdminBook(bookId, input) {
    return updateAdminBook(prisma, bookId, input);
  },
  async archiveAdminBook(bookId) {
    return archiveAdminBook(prisma, bookId);
  },
  async restoreAdminBook(bookId) {
    return restoreAdminBook(prisma, bookId);
  },
  async findAdminGenres(status) {
    return findAdminGenres(prisma, status);
  },
  async createAdminGenre(input) {
    return createAdminGenre(prisma, input);
  },
  async updateAdminGenre(genreId, input) {
    return updateAdminGenre(prisma, genreId, input);
  },
  async archiveAdminGenre(genreId) {
    return archiveAdminGenre(prisma, genreId);
  },
  async restoreAdminGenre(genreId) {
    return restoreAdminGenre(prisma, genreId);
  },
};

const mailDelivery =
  environment.RESEND_API_KEY !== undefined &&
  environment.RESEND_FROM_EMAIL !== undefined
    ? createResendVerificationMailDelivery(
        environment.RESEND_API_KEY,
        environment.RESEND_FROM_EMAIL,
      )
    : new UnavailableVerificationMailDelivery();

const app = createApp(
  database,
  {
    corsOrigin: environment.CORS_ORIGIN,
    jwtSecret: environment.JWT_SECRET,
    sessionTtlSeconds: environment.JWT_TTL_SECONDS,
    secureCookie:
      environment.COOKIE_SECURE ??
      new URL(environment.CORS_ORIGIN).protocol === "https:",
  },
  {
    account: { store: database, mailDelivery },
  },
);
let server: ReturnType<typeof app.listen> | undefined;
let accountSetupCleanup: AccountSetupCleanupLifecycle | undefined;

async function start() {
  try {
    accountSetupCleanup = await startAccountSetupCleanup({
      cleanup: (now, batchSize) =>
        cleanupExpiredAccountSetup(prisma, now, batchSize),
    });
  } catch {
    console.error("Expired account setup cleanup failed during API startup.");
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  server = app.listen(environment.PORT, () => {
    console.info(`API listening on port ${environment.PORT}.`);
  });
}

async function shutdown(signal: string) {
  console.info(`${signal} received; shutting down API.`);
  accountSetupCleanup?.stop();

  if (server === undefined) {
    await prisma.$disconnect();
    process.exit(0);
  }

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

void start();
