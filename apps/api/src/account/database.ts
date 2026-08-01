import { Prisma, type PrismaClient, UserRole } from "@prisma/client";
import {
  EMAIL_VERIFICATION_MAX_ATTEMPTS,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
  PENDING_REGISTRATION_EXPIRES_IN_SECONDS,
  profileSchema,
  type AuthenticatedUser,
  type Profile,
} from "@amazon-2/contracts";

import { DUMMY_PASSWORD_HASH } from "../auth/password.js";
import type { VerificationChallengeDraft } from "./verification-code.js";
import {
  hashPendingVerificationToken,
  hashVerificationCode,
  pendingVerificationTokenMatches,
  verificationCodeMatches,
} from "./verification-code.js";

const PENDING_USER_DISPLAY_NAME = "Pending Reader";
const scrubbedChallengeData = {
  codeHash: null,
  pendingTokenHash: null,
  candidateDisplayName: null,
  candidatePasswordHash: null,
} as const;

export interface ReaderRegistrationRecord {
  displayName: string;
  email: string;
  passwordHash: string;
}

export type VerificationDispatchPreparation =
  | { kind: "accepted"; retainedPendingToken?: string }
  | { kind: "dispatch"; challengeId: string; email: string };

export type EmailVerificationResult =
  | { kind: "invalid" }
  | { kind: "verified"; user: AuthenticatedUser };

const profileSelection = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  email: true,
  displayName: true,
  role: true,
  emailVerifiedAt: true,
  createdAt: true,
});

type ProfileRow = Prisma.UserGetPayload<{
  select: typeof profileSelection;
}>;

function isKnownPrismaError(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

async function serializableTransaction<T>(
  prisma: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  retryUniqueConflict = false,
): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      const canRetry =
        isKnownPrismaError(error, "P2034") ||
        (retryUniqueConflict && isKnownPrismaError(error, "P2002"));

      if (attempt < 3 && canRetry) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Serializable transaction retry limit reached.");
}

function toProfile(row: ProfileRow): Profile {
  return profileSchema.parse({
    ...row,
    emailVerifiedAt: row.emailVerifiedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  });
}

async function createVerificationChallenge(
  transaction: Prisma.TransactionClient,
  user: { id: string; email: string },
  pendingRegistrationId: string,
  draft: VerificationChallengeDraft,
  candidate: { displayName: string; passwordHash: string },
  secret: string,
  now: Date,
): Promise<VerificationDispatchPreparation> {
  await transaction.emailVerificationChallenge.create({
    data: {
      id: draft.id,
      userId: user.id,
      pendingRegistrationId,
      codeHash: hashVerificationCode(
        secret,
        draft.id,
        user.email,
        draft.code,
      ),
      pendingTokenHash: hashPendingVerificationToken(
        secret,
        draft.id,
        user.email,
        draft.pendingToken,
      ),
      candidateDisplayName: candidate.displayName,
      candidatePasswordHash: candidate.passwordHash,
      expiresAt: draft.expiresAt,
      attemptCount: 0,
      scheduledAt: draft.createdAt,
      dispatchedAt: null,
      deliveryFailedAt: null,
      invalidatedAt: null,
      usedAt: null,
      createdAt: draft.createdAt,
      updatedAt: draft.createdAt,
    },
  });

  return { kind: "dispatch", challengeId: draft.id, email: user.email };
}

async function scrubOpenChallenges(
  transaction: Prisma.TransactionClient,
  userId: string,
  invalidatedAt: Date,
) {
  await transaction.emailVerificationChallenge.updateMany({
    where: {
      userId,
      invalidatedAt: null,
      usedAt: null,
    },
    data: { invalidatedAt, ...scrubbedChallengeData },
  });
}

export async function prepareReaderRegistration(
  prisma: PrismaClient,
  registration: ReaderRegistrationRecord,
  draft: VerificationChallengeDraft,
  secret: string,
  now = new Date(),
): Promise<VerificationDispatchPreparation> {
  return serializableTransaction(
    prisma,
    async (transaction) => {
      const existing = await transaction.user.findUnique({
        where: { email: registration.email },
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
        },
      });

      if (existing !== null && existing.emailVerifiedAt !== null) {
        return { kind: "accepted" };
      }

      const user =
        existing ??
        (await transaction.user.create({
          data: {
            email: registration.email,
            displayName: PENDING_USER_DISPLAY_NAME,
            passwordHash: DUMMY_PASSWORD_HASH,
            role: UserRole.READER,
            emailVerifiedAt: null,
          },
          select: { id: true, email: true, emailVerifiedAt: true },
        }));

      await scrubOpenChallenges(transaction, user.id, now);
      await transaction.pendingRegistration.deleteMany({
        where: { userId: user.id },
      });
      await transaction.pendingRegistration.create({
        data: {
          id: draft.id,
          userId: user.id,
          tokenHash: hashPendingVerificationToken(
            secret,
            draft.id,
            user.email,
            draft.pendingToken,
          ),
          candidateDisplayName: registration.displayName,
          candidatePasswordHash: registration.passwordHash,
          expiresAt: new Date(
            now.getTime() +
              PENDING_REGISTRATION_EXPIRES_IN_SECONDS * 1_000,
          ),
          createdAt: now,
          updatedAt: now,
        },
      });

      return createVerificationChallenge(
        transaction,
        user,
        draft.id,
        draft,
        {
          displayName: registration.displayName,
          passwordHash: registration.passwordHash,
        },
        secret,
        now,
      );
    },
    true,
  );
}

export async function prepareVerificationResend(
  prisma: PrismaClient,
  email: string,
  draft: VerificationChallengeDraft,
  secret: string,
  currentPendingToken: string | null,
  now = new Date(),
): Promise<VerificationDispatchPreparation> {
  return serializableTransaction(prisma, async (transaction) => {
    const user = await transaction.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    if (user === null || user.emailVerifiedAt !== null) {
      return { kind: "accepted" };
    }

    const pendingRegistration = await transaction.pendingRegistration.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        tokenHash: true,
        candidateDisplayName: true,
        candidatePasswordHash: true,
        expiresAt: true,
      },
    });

    if (
      pendingRegistration === null ||
      pendingRegistration.expiresAt.getTime() <= now.getTime()
    ) {
      if (pendingRegistration !== null) {
        await scrubOpenChallenges(transaction, user.id, now);
        await transaction.pendingRegistration.deleteMany({
          where: { id: pendingRegistration.id },
        });
      }
      return { kind: "accepted" };
    }

    if (
      currentPendingToken === null ||
      !pendingVerificationTokenMatches(
        pendingRegistration.tokenHash,
        secret,
        pendingRegistration.id,
        user.email,
        currentPendingToken,
      )
    ) {
      return { kind: "accepted" };
    }

    const latestChallenge =
      await transaction.emailVerificationChallenge.findFirst({
        where: {
          pendingRegistrationId: pendingRegistration.id,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { scheduledAt: true },
      });

    const cooldownCutoff = new Date(
      now.getTime() - EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1_000,
    );
    if (
      latestChallenge !== null &&
      latestChallenge.scheduledAt.getTime() > cooldownCutoff.getTime()
    ) {
      return { kind: "accepted", retainedPendingToken: currentPendingToken };
    }

    await scrubOpenChallenges(transaction, user.id, now);
    await transaction.pendingRegistration.update({
      where: { id: pendingRegistration.id },
      data: {
        tokenHash: hashPendingVerificationToken(
          secret,
          pendingRegistration.id,
          user.email,
          draft.pendingToken,
        ),
        updatedAt: now,
      },
    });

    return createVerificationChallenge(
      transaction,
      user,
      pendingRegistration.id,
      draft,
      {
        displayName: pendingRegistration.candidateDisplayName,
        passwordHash: pendingRegistration.candidatePasswordHash,
      },
      secret,
      now,
    );
  });
}

export async function markVerificationChallengeDispatched(
  prisma: PrismaClient,
  challengeId: string,
  dispatchedAt = new Date(),
) {
  const result = await prisma.emailVerificationChallenge.updateMany({
    where: {
      id: challengeId,
      dispatchedAt: null,
      deliveryFailedAt: null,
      invalidatedAt: null,
      usedAt: null,
    },
    data: { dispatchedAt },
  });

  if (result.count !== 1) {
    throw new Error("Verification challenge could not be activated.");
  }
}

export async function invalidateVerificationChallenge(
  prisma: PrismaClient,
  challengeId: string,
  invalidatedAt = new Date(),
) {
  await prisma.emailVerificationChallenge.updateMany({
    where: {
      id: challengeId,
      invalidatedAt: null,
      usedAt: null,
    },
    data: { invalidatedAt, ...scrubbedChallengeData },
  });
}

export async function markVerificationChallengeDeliveryFailed(
  prisma: PrismaClient,
  challengeId: string,
  deliveryFailedAt = new Date(),
) {
  await prisma.emailVerificationChallenge.updateMany({
    where: {
      id: challengeId,
      dispatchedAt: null,
      deliveryFailedAt: null,
      invalidatedAt: null,
      usedAt: null,
    },
    data: { deliveryFailedAt, ...scrubbedChallengeData },
  });
}

export async function verifyEmailCode(
  prisma: PrismaClient,
  email: string,
  code: string,
  pendingToken: string,
  secret: string,
  now = new Date(),
): Promise<EmailVerificationResult> {
  return serializableTransaction(prisma, async (transaction) => {
    const user = await transaction.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        emailVerifiedAt: true,
      },
    });

    if (user === null || user.emailVerifiedAt !== null) {
      return { kind: "invalid" };
    }

    const challenge = await transaction.emailVerificationChallenge.findFirst({
      where: {
        userId: user.id,
        dispatchedAt: { not: null },
        invalidatedAt: null,
        usedAt: null,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        pendingRegistrationId: true,
        codeHash: true,
        pendingTokenHash: true,
        candidateDisplayName: true,
        candidatePasswordHash: true,
        expiresAt: true,
        attemptCount: true,
      },
    });

    if (challenge === null) {
      return { kind: "invalid" };
    }

    const pendingRegistration =
      challenge.pendingRegistrationId === null
        ? null
        : await transaction.pendingRegistration.findUnique({
            where: { id: challenge.pendingRegistrationId },
            select: {
              id: true,
              userId: true,
              tokenHash: true,
              candidateDisplayName: true,
              candidatePasswordHash: true,
              expiresAt: true,
            },
          });

    if (
      pendingRegistration === null ||
      pendingRegistration.userId !== user.id
    ) {
      await transaction.emailVerificationChallenge.update({
        where: { id: challenge.id },
        data: { invalidatedAt: now, ...scrubbedChallengeData },
      });
      return { kind: "invalid" };
    }

    if (pendingRegistration.expiresAt.getTime() <= now.getTime()) {
      await scrubOpenChallenges(transaction, user.id, now);
      await transaction.pendingRegistration.deleteMany({
        where: { id: pendingRegistration.id },
      });
      return { kind: "invalid" };
    }

    if (
      challenge.expiresAt.getTime() <= now.getTime() ||
      challenge.attemptCount >= EMAIL_VERIFICATION_MAX_ATTEMPTS
    ) {
      await transaction.emailVerificationChallenge.update({
        where: { id: challenge.id },
        data: { invalidatedAt: now, ...scrubbedChallengeData },
      });
      return { kind: "invalid" };
    }

    if (
      challenge.codeHash === null ||
      challenge.pendingRegistrationId === null ||
      challenge.pendingTokenHash === null ||
      challenge.candidateDisplayName === null ||
      challenge.candidatePasswordHash === null ||
      challenge.candidateDisplayName !==
        pendingRegistration.candidateDisplayName ||
      challenge.candidatePasswordHash !==
        pendingRegistration.candidatePasswordHash
    ) {
      await transaction.emailVerificationChallenge.update({
        where: { id: challenge.id },
        data: { invalidatedAt: now, ...scrubbedChallengeData },
      });
      return { kind: "invalid" };
    }

    const codeMatches = verificationCodeMatches(
      challenge.codeHash,
      secret,
      challenge.id,
      user.email,
      code,
    );
    const pendingTokenMatches = pendingVerificationTokenMatches(
      challenge.pendingTokenHash,
      secret,
      challenge.id,
      user.email,
      pendingToken,
    );
    const pendingRegistrationTokenMatches = pendingVerificationTokenMatches(
      pendingRegistration.tokenHash,
      secret,
      pendingRegistration.id,
      user.email,
      pendingToken,
    );

    if (!pendingTokenMatches || !pendingRegistrationTokenMatches) {
      return { kind: "invalid" };
    }

    if (!codeMatches) {
      const attemptCount = challenge.attemptCount + 1;
      await transaction.emailVerificationChallenge.update({
        where: { id: challenge.id },
        data: {
          attemptCount,
          ...(attemptCount >= EMAIL_VERIFICATION_MAX_ATTEMPTS
            ? { invalidatedAt: now, ...scrubbedChallengeData }
            : {}),
        },
      });
      return { kind: "invalid" };
    }

    await transaction.emailVerificationChallenge.update({
      where: { id: challenge.id },
      data: { usedAt: now, ...scrubbedChallengeData },
    });
    const verified = await transaction.user.update({
      where: { id: user.id },
      data: {
        displayName: challenge.candidateDisplayName,
        passwordHash: challenge.candidatePasswordHash,
        role: UserRole.READER,
        emailVerifiedAt: now,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
      },
    });
    await transaction.pendingRegistration.deleteMany({
      where: { id: challenge.pendingRegistrationId },
    });

    return { kind: "verified", user: verified };
  });
}

export async function findProfileById(
  prisma: PrismaClient,
  userId: string,
): Promise<Profile | null> {
  const row = await prisma.user.findFirst({
    where: { id: userId, emailVerifiedAt: { not: null } },
    select: profileSelection,
  });

  return row === null ? null : toProfile(row);
}

export async function updateProfileDisplayName(
  prisma: PrismaClient,
  userId: string,
  displayName: string,
): Promise<Profile | null> {
  return serializableTransaction(prisma, async (transaction) => {
    const existing = await transaction.user.findFirst({
      where: { id: userId, emailVerifiedAt: { not: null } },
      select: { id: true },
    });

    if (existing === null) {
      return null;
    }

    const updated = await transaction.user.update({
      where: { id: userId },
      data: { displayName },
      select: profileSelection,
    });

    return toProfile(updated);
  });
}
