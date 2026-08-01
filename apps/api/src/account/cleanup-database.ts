import type { PrismaClient } from "@prisma/client";

const sensitiveChallengeFields = [
  { codeHash: { not: null } },
  { pendingTokenHash: { not: null } },
  { candidateDisplayName: { not: null } },
  { candidatePasswordHash: { not: null } },
] as const;

const scrubbedChallengeData = {
  codeHash: null,
  pendingTokenHash: null,
  candidateDisplayName: null,
  candidatePasswordHash: null,
} as const;

export interface AccountSetupCleanupResult {
  challengesScrubbed: number;
  pendingRegistrationsDeleted: number;
  mayHaveMore: boolean;
}

export async function cleanupExpiredAccountSetup(
  prisma: PrismaClient,
  now: Date,
  batchSize: number,
): Promise<AccountSetupCleanupResult> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new RangeError("Account setup cleanup batch size must be positive.");
  }

  const expiredChallenges =
    await prisma.emailVerificationChallenge.findMany({
      where: {
        AND: [
          {
            OR: [
              { expiresAt: { lte: now } },
              {
                pendingRegistration: {
                  is: { expiresAt: { lte: now } },
                },
              },
            ],
          },
          { OR: [...sensitiveChallengeFields] },
        ],
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: batchSize,
      select: { id: true },
    });
  const challengeIds = expiredChallenges.map(({ id }) => id);

  if (challengeIds.length > 0) {
    await prisma.emailVerificationChallenge.updateMany({
      where: {
        id: { in: challengeIds },
        invalidatedAt: null,
        usedAt: null,
      },
      data: { invalidatedAt: now },
    });
  }

  const challengeResult =
    challengeIds.length === 0
      ? { count: 0 }
      : await prisma.emailVerificationChallenge.updateMany({
          where: {
            id: { in: challengeIds },
            OR: [...sensitiveChallengeFields],
          },
          data: scrubbedChallengeData,
        });

  const remainingBatchSize = batchSize - expiredChallenges.length;
  const expiredPendingRegistrations =
    remainingBatchSize === 0
      ? []
      : await prisma.pendingRegistration.findMany({
          where: {
            expiresAt: { lte: now },
            challenges: {
              none: { OR: [...sensitiveChallengeFields] },
            },
          },
          orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
          take: remainingBatchSize,
          select: { id: true },
        });
  const pendingRegistrationIds = expiredPendingRegistrations.map(
    ({ id }) => id,
  );

  const pendingRegistrationResult =
    pendingRegistrationIds.length === 0
      ? { count: 0 }
      : await prisma.pendingRegistration.deleteMany({
          where: {
            id: { in: pendingRegistrationIds },
            expiresAt: { lte: now },
            challenges: {
              none: { OR: [...sensitiveChallengeFields] },
            },
          },
        });

  return {
    challengesScrubbed: challengeResult.count,
    pendingRegistrationsDeleted: pendingRegistrationResult.count,
    mayHaveMore:
      expiredChallenges.length === batchSize ||
      expiredPendingRegistrations.length === remainingBatchSize,
  };
}
