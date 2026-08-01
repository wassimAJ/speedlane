import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { cleanupExpiredAccountSetup } from "./cleanup-database.js";

const now = new Date("2026-08-01T12:00:00.000Z");

interface MemoryPendingRegistration {
  id: string;
  userId: string;
  expiresAt: Date;
  candidateDisplayName: string;
  candidatePasswordHash: string;
}

interface MemoryChallenge {
  id: string;
  userId: string;
  pendingRegistrationId: string | null;
  expiresAt: Date;
  codeHash: string | null;
  pendingTokenHash: string | null;
  candidateDisplayName: string | null;
  candidatePasswordHash: string | null;
  invalidatedAt: Date | null;
  usedAt: Date | null;
  scheduledAt: Date;
}

function hasSensitiveChallengeData(challenge: MemoryChallenge) {
  return (
    challenge.codeHash !== null ||
    challenge.pendingTokenHash !== null ||
    challenge.candidateDisplayName !== null ||
    challenge.candidatePasswordHash !== null
  );
}

function pendingRegistration(
  id: string,
  userId: string,
  expiresAt: Date,
): MemoryPendingRegistration {
  return {
    id,
    userId,
    expiresAt,
    candidateDisplayName: `${userId} candidate`,
    candidatePasswordHash: `${userId} password hash`,
  };
}

function challenge(
  id: string,
  userId: string,
  expiresAt: Date,
  pendingRegistrationId: string | null = null,
): MemoryChallenge {
  return {
    id,
    userId,
    pendingRegistrationId,
    expiresAt,
    codeHash: `${id} code hash`,
    pendingTokenHash: `${id} token hash`,
    candidateDisplayName: `${userId} candidate`,
    candidatePasswordHash: `${userId} password hash`,
    invalidatedAt: null,
    usedAt: null,
    scheduledAt: new Date(now.getTime() - 60_000),
  };
}

function memoryDatabase(
  challenges: MemoryChallenge[],
  pendingRegistrations: MemoryPendingRegistration[],
) {
  const state = { challenges, pendingRegistrations };
  const prisma = {
    emailVerificationChallenge: {
      findMany: vi.fn(async ({ take }) =>
        state.challenges
          .filter((row) => {
            const pending = state.pendingRegistrations.find(
              ({ id }) => id === row.pendingRegistrationId,
            );
            return (
              hasSensitiveChallengeData(row) &&
              (row.expiresAt.getTime() <= now.getTime() ||
                (pending !== undefined &&
                  pending.expiresAt.getTime() <= now.getTime()))
            );
          })
          .sort(
            (left, right) =>
              left.expiresAt.getTime() - right.expiresAt.getTime() ||
              left.id.localeCompare(right.id),
          )
          .slice(0, take)
          .map(({ id }) => ({ id })),
      ),
      updateMany: vi.fn(async ({ where, data }) => {
        const ids = new Set<string>(where.id.in);
        let count = 0;
        for (const row of state.challenges) {
          if (!ids.has(row.id)) continue;

          if (data.invalidatedAt !== undefined) {
            if (row.invalidatedAt !== null || row.usedAt !== null) continue;
            row.invalidatedAt = data.invalidatedAt;
            count += 1;
            continue;
          }

          if (!hasSensitiveChallengeData(row)) continue;
          row.codeHash = null;
          row.pendingTokenHash = null;
          row.candidateDisplayName = null;
          row.candidatePasswordHash = null;
          count += 1;
        }
        return { count };
      }),
    },
    pendingRegistration: {
      findMany: vi.fn(async ({ take }) =>
        state.pendingRegistrations
          .filter(
            (pending) =>
              pending.expiresAt.getTime() <= now.getTime() &&
              !state.challenges.some(
                (row) =>
                  row.pendingRegistrationId === pending.id &&
                  hasSensitiveChallengeData(row),
              ),
          )
          .sort(
            (left, right) =>
              left.expiresAt.getTime() - right.expiresAt.getTime() ||
              left.id.localeCompare(right.id),
          )
          .slice(0, take)
          .map(({ id }) => ({ id })),
      ),
      deleteMany: vi.fn(async ({ where }) => {
        const ids = new Set<string>(where.id.in);
        const deletedIds = new Set(
          state.pendingRegistrations
            .filter(
              (pending) =>
                ids.has(pending.id) &&
                pending.expiresAt.getTime() <= now.getTime() &&
                !state.challenges.some(
                  (row) =>
                    row.pendingRegistrationId === pending.id &&
                    hasSensitiveChallengeData(row),
                ),
            )
            .map(({ id }) => id),
        );
        state.pendingRegistrations = state.pendingRegistrations.filter(
          ({ id }) => !deletedIds.has(id),
        );
        for (const row of state.challenges) {
          if (
            row.pendingRegistrationId !== null &&
            deletedIds.has(row.pendingRegistrationId)
          ) {
            row.pendingRegistrationId = null;
          }
        }
        return { count: deletedIds.size };
      }),
    },
  } as unknown as PrismaClient;

  return { prisma, state };
}

describe("expired account setup cleanup", () => {
  it("scrubs abandoned challenge data across users and deletes only expired pending setup", async () => {
    const expired = new Date(now.getTime() - 1);
    const live = new Date(now.getTime() + 60_000);
    const database = memoryDatabase(
      [
        challenge("expired-code", "user-1", expired),
        challenge("expired-setup-code", "user-2", live, "expired-setup"),
        challenge("live-code", "user-3", live, "live-setup"),
      ],
      [
        pendingRegistration("expired-setup", "user-2", expired),
        pendingRegistration("live-setup", "user-3", live),
      ],
    );
    const liveChallengeBefore = { ...database.state.challenges[2] };
    const sendVerificationCode = vi.fn();

    await expect(
      cleanupExpiredAccountSetup(database.prisma, now, 100),
    ).resolves.toEqual({
      challengesScrubbed: 2,
      pendingRegistrationsDeleted: 1,
      mayHaveMore: false,
    });

    for (const row of database.state.challenges.slice(0, 2)) {
      expect(row).toMatchObject({
        codeHash: null,
        pendingTokenHash: null,
        candidateDisplayName: null,
        candidatePasswordHash: null,
        invalidatedAt: now,
      });
    }
    expect(database.state.challenges[2]).toEqual(liveChallengeBefore);
    expect(database.state.pendingRegistrations).toEqual([
      expect.objectContaining({ id: "live-setup" }),
    ]);
    expect(sendVerificationCode).not.toHaveBeenCalled();
  });

  it("bounds total challenge and pending-registration work by the configured batch", async () => {
    const expired = new Date(now.getTime() - 1);
    const database = memoryDatabase(
      [1, 2, 3].map((sequence) =>
        challenge(`challenge-${sequence}`, `user-${sequence}`, expired),
      ),
      [1, 2, 3].map((sequence) =>
        pendingRegistration(`pending-${sequence}`, `other-${sequence}`, expired),
      ),
    );

    await expect(
      cleanupExpiredAccountSetup(database.prisma, now, 2),
    ).resolves.toEqual({
      challengesScrubbed: 2,
      pendingRegistrationsDeleted: 0,
      mayHaveMore: true,
    });
    expect(
      database.state.challenges.filter(hasSensitiveChallengeData),
    ).toHaveLength(1);
    expect(database.state.pendingRegistrations).toHaveLength(3);
  });

  it("is idempotent after all expired data has been cleaned", async () => {
    const expired = new Date(now.getTime() - 1);
    const database = memoryDatabase(
      [challenge("challenge-1", "user-1", expired, "pending-1")],
      [pendingRegistration("pending-1", "user-1", expired)],
    );

    await cleanupExpiredAccountSetup(database.prisma, now, 100);
    const stateAfterFirstPass = structuredClone(database.state);

    await expect(
      cleanupExpiredAccountSetup(database.prisma, now, 100),
    ).resolves.toEqual({
      challengesScrubbed: 0,
      pendingRegistrationsDeleted: 0,
      mayHaveMore: false,
    });
    expect(database.state).toEqual(stateAfterFirstPass);
  });
});
