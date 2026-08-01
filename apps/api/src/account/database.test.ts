import { UserRole, type PrismaClient } from "@prisma/client";
import { PENDING_REGISTRATION_EXPIRES_IN_SECONDS } from "@amazon-2/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from "../auth/password.js";
import {
  markVerificationChallengeDeliveryFailed,
  markVerificationChallengeDispatched,
  prepareReaderRegistration,
  prepareVerificationResend,
  verifyEmailCode,
} from "./database.js";
import {
  hashPendingVerificationToken,
  type VerificationChallengeDraft,
} from "./verification-code.js";

const secret = "test-only-secret-with-more-than-thirty-two-characters";
const start = new Date("2026-08-01T10:00:00.000Z");

interface MemoryUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
  emailVerifiedAt: Date | null;
}

interface MemoryPendingRegistration {
  id: string;
  userId: string;
  tokenHash: string;
  candidateDisplayName: string;
  candidatePasswordHash: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface MemoryChallenge {
  id: string;
  userId: string;
  pendingRegistrationId: string | null;
  codeHash: string | null;
  pendingTokenHash: string | null;
  candidateDisplayName: string | null;
  candidatePasswordHash: string | null;
  expiresAt: Date;
  attemptCount: number;
  scheduledAt: Date;
  dispatchedAt: Date | null;
  deliveryFailedAt: Date | null;
  invalidatedAt: Date | null;
  usedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function challengeDraft(
  sequence: number,
  createdAt = start,
): VerificationChallengeDraft {
  return {
    id: `00000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`,
    code: sequence.toString().padStart(6, "0").slice(-6),
    pendingToken: String.fromCharCode(96 + ((sequence - 1) % 26) + 1).repeat(43),
    createdAt,
    expiresAt: new Date(createdAt.getTime() + 600_000),
  };
}

function matchesChallengeWhere(
  challenge: MemoryChallenge,
  where: Record<string, any>,
) {
  if (where.id !== undefined && challenge.id !== where.id) return false;
  if (where.userId !== undefined && challenge.userId !== where.userId) return false;
  if (
    where.pendingRegistrationId !== undefined &&
    challenge.pendingRegistrationId !== where.pendingRegistrationId
  ) return false;
  if (where.invalidatedAt === null && challenge.invalidatedAt !== null) return false;
  if (where.usedAt === null && challenge.usedAt !== null) return false;
  if (where.dispatchedAt === null && challenge.dispatchedAt !== null) return false;
  if (
    where.dispatchedAt?.not === null &&
    challenge.dispatchedAt === null
  ) return false;
  if (
    where.deliveryFailedAt === null &&
    challenge.deliveryFailedAt !== null
  ) return false;
  if (
    where.expiresAt?.gt instanceof Date &&
    challenge.expiresAt.getTime() <= where.expiresAt.gt.getTime()
  ) return false;
  return true;
}

function memoryDatabase(initialUser: MemoryUser | null = null) {
  const state: {
    user: MemoryUser | null;
    pendingRegistration: MemoryPendingRegistration | null;
    challenges: MemoryChallenge[];
  } = {
    user: initialUser,
    pendingRegistration: null,
    challenges: [],
  };

  const updateChallenges = vi.fn(async ({ where, data }) => {
    let count = 0;
    for (const challenge of state.challenges) {
      if (matchesChallengeWhere(challenge, where)) {
        Object.assign(challenge, data);
        count += 1;
      }
    }
    return { count };
  });

  const transaction = {
    user: {
      findUnique: vi.fn(async ({ where }) =>
        state.user?.email === where.email ? { ...state.user } : null,
      ),
      create: vi.fn(async ({ data }) => {
        state.user = {
          id: "00000000-0000-4000-8000-000000000001",
          ...data,
        };
        return { ...state.user };
      }),
      update: vi.fn(async ({ data }) => {
        if (state.user === null) throw new Error("Missing memory user.");
        Object.assign(state.user, data);
        return {
          id: state.user.id,
          email: state.user.email,
          displayName: state.user.displayName,
          role: state.user.role,
        };
      }),
    },
    pendingRegistration: {
      findUnique: vi.fn(async ({ where }) => {
        const pending = state.pendingRegistration;
        if (
          pending === null ||
          (where.userId !== undefined && pending.userId !== where.userId) ||
          (where.id !== undefined && pending.id !== where.id)
        ) {
          return null;
        }
        return { ...pending };
      }),
      create: vi.fn(async ({ data }) => {
        state.pendingRegistration = { ...data };
        return { ...data };
      }),
      update: vi.fn(async ({ where, data }) => {
        if (state.pendingRegistration?.id !== where.id) {
          throw new Error("Missing memory pending registration.");
        }
        Object.assign(state.pendingRegistration, data);
        return { ...state.pendingRegistration };
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const pending = state.pendingRegistration;
        if (
          pending === null ||
          (where.id !== undefined && pending.id !== where.id) ||
          (where.userId !== undefined && pending.userId !== where.userId)
        ) {
          return { count: 0 };
        }
        for (const challenge of state.challenges) {
          if (challenge.pendingRegistrationId === pending.id) {
            challenge.pendingRegistrationId = null;
          }
        }
        state.pendingRegistration = null;
        return { count: 1 };
      }),
    },
    emailVerificationChallenge: {
      create: vi.fn(async ({ data }) => {
        state.challenges.push({ ...data });
        return { ...data };
      }),
      updateMany: updateChallenges,
      findFirst: vi.fn(async ({ where }) => {
        const candidates = state.challenges
          .filter((challenge) => matchesChallengeWhere(challenge, where))
          .sort((left, right) =>
            right.createdAt.getTime() - left.createdAt.getTime() ||
            right.id.localeCompare(left.id),
          );
        return candidates[0] === undefined ? null : { ...candidates[0] };
      }),
      update: vi.fn(async ({ where, data }) => {
        const challenge = state.challenges.find(({ id }) => id === where.id);
        if (challenge === undefined) throw new Error("Missing memory challenge.");
        Object.assign(challenge, data);
        return { ...challenge };
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (operation) => operation(transaction)),
    emailVerificationChallenge: {
      updateMany: updateChallenges,
    },
  } as unknown as PrismaClient;

  return { prisma, state, transaction };
}

async function register(
  database: ReturnType<typeof memoryDatabase>,
  draft: VerificationChallengeDraft,
  displayName: string,
  passwordHash: string,
  now = draft.createdAt,
) {
  return prepareReaderRegistration(
    database.prisma,
    { displayName, email: "reader@example.com", passwordHash },
    draft,
    secret,
    now,
  );
}

function activeChallenge(database: ReturnType<typeof memoryDatabase>) {
  const challenge = database.state.challenges.at(-1);
  if (challenge === undefined) throw new Error("Expected a memory challenge.");
  return challenge;
}

describe("challenge-bound reader registration", () => {
  it("creates an unverified placeholder and persists staged secrets as hashes only", async () => {
    const database = memoryDatabase();
    const draft = challengeDraft(1);

    await expect(
      register(database, draft, "Candidate Reader", "candidate-password-hash"),
    ).resolves.toEqual({
      kind: "dispatch",
      challengeId: draft.id,
      email: "reader@example.com",
    });

    expect(database.state.user).toMatchObject({
      displayName: "Pending Reader",
      passwordHash: DUMMY_PASSWORD_HASH,
      role: UserRole.READER,
      emailVerifiedAt: null,
    });
    expect(database.state.pendingRegistration).toMatchObject({
      candidateDisplayName: "Candidate Reader",
      candidatePasswordHash: "candidate-password-hash",
      expiresAt: new Date(
        start.getTime() + PENDING_REGISTRATION_EXPIRES_IN_SECONDS * 1_000,
      ),
    });
    const challenge = activeChallenge(database);
    expect(challenge).toMatchObject({
      candidateDisplayName: "Candidate Reader",
      candidatePasswordHash: "candidate-password-hash",
      pendingRegistrationId: draft.id,
      scheduledAt: start,
      dispatchedAt: null,
    });
    expect(challenge.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(challenge.pendingTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(challenge).not.toHaveProperty("code");
    expect(challenge).not.toHaveProperty("pendingToken");
    expect(database.state.pendingRegistration).not.toHaveProperty("pendingToken");
  });

  it("always stages and supersedes duplicate registration, even inside resend cooldown", async () => {
    const database = memoryDatabase();
    const first = challengeDraft(1);
    const second = challengeDraft(2, new Date(start.getTime() + 30_000));
    await register(database, first, "First Candidate", "first-hash");
    await markVerificationChallengeDispatched(database.prisma, first.id, start);

    await expect(
      register(database, second, "Second Candidate", "second-hash"),
    ).resolves.toMatchObject({ kind: "dispatch", challengeId: second.id });

    expect(database.state.user).toMatchObject({
      displayName: "Pending Reader",
      passwordHash: DUMMY_PASSWORD_HASH,
      role: UserRole.READER,
    });
    expect(database.state.pendingRegistration).toMatchObject({
      id: second.id,
      candidateDisplayName: "Second Candidate",
      candidatePasswordHash: "second-hash",
    });
    expect(database.state.challenges[0]).toMatchObject({
      invalidatedAt: second.createdAt,
      codeHash: null,
      pendingTokenHash: null,
      candidateDisplayName: null,
      candidatePasswordHash: null,
      pendingRegistrationId: null,
    });
  });

  it("supports victim-first/attacker-second only with the exact latest code-token pair", async () => {
    const database = memoryDatabase();
    const victim = challengeDraft(1);
    const attacker = challengeDraft(2, new Date(start.getTime() + 30_000));
    await register(database, victim, "Victim Reader", "victim-hash");
    await markVerificationChallengeDispatched(database.prisma, victim.id, start);
    await register(database, attacker, "Attacker Name", "attacker-hash");
    await markVerificationChallengeDispatched(
      database.prisma,
      attacker.id,
      attacker.createdAt,
    );

    await expect(
      verifyEmailCode(
        database.prisma,
        "reader@example.com",
        victim.code,
        victim.pendingToken,
        secret,
        attacker.createdAt,
      ),
    ).resolves.toEqual({ kind: "invalid" });
    await expect(
      verifyEmailCode(
        database.prisma,
        "reader@example.com",
        attacker.code,
        victim.pendingToken,
        secret,
        attacker.createdAt,
      ),
    ).resolves.toEqual({ kind: "invalid" });
    expect(activeChallenge(database).attemptCount).toBe(0);
    expect(database.state.user?.emailVerifiedAt).toBeNull();
  });

  it("supports attacker-first/victim-second inside sixty seconds and commits only victim data", async () => {
    const database = memoryDatabase();
    const attacker = challengeDraft(1);
    const victim = challengeDraft(2, new Date(start.getTime() + 30_000));
    const attackerHash = await hashPassword("AttackerReader456");
    const victimHash = await hashPassword("VictimReader123");
    await register(database, attacker, "Attacker Name", attackerHash);
    await markVerificationChallengeDispatched(database.prisma, attacker.id, start);
    await register(database, victim, "Victim Reader", victimHash);
    await markVerificationChallengeDispatched(
      database.prisma,
      victim.id,
      victim.createdAt,
    );

    await expect(
      verifyEmailCode(
        database.prisma,
        "reader@example.com",
        attacker.code,
        attacker.pendingToken,
        secret,
        victim.createdAt,
      ),
    ).resolves.toEqual({ kind: "invalid" });
    await expect(
      verifyEmailCode(
        database.prisma,
        "reader@example.com",
        victim.code,
        victim.pendingToken,
        secret,
        victim.createdAt,
      ),
    ).resolves.toMatchObject({
      kind: "verified",
      user: { displayName: "Victim Reader", role: UserRole.READER },
    });

    expect(await verifyPassword("AttackerReader456", database.state.user!.passwordHash)).toBe(false);
    expect(await verifyPassword("VictimReader123", database.state.user!.passwordHash)).toBe(true);
    expect(database.state.pendingRegistration).toBeNull();
    expect(activeChallenge(database)).toMatchObject({
      usedAt: victim.createdAt,
      codeHash: null,
      pendingTokenHash: null,
      candidateDisplayName: null,
      candidatePasswordHash: null,
      pendingRegistrationId: null,
    });
  });

  it("keeps verified users untouched behind generic acceptance", async () => {
    const verifiedAt = new Date(start.getTime() - 1_000);
    const user: MemoryUser = {
      id: "00000000-0000-4000-8000-000000000001",
      email: "reader@example.com",
      displayName: "Verified Reader",
      passwordHash: "verified-hash",
      role: UserRole.READER,
      emailVerifiedAt: verifiedAt,
    };
    const database = memoryDatabase(user);

    await expect(
      register(database, challengeDraft(1), "Replacement", "replacement-hash"),
    ).resolves.toEqual({ kind: "accepted" });
    expect(database.state.user).toEqual(user);
    expect(database.state.pendingRegistration).toBeNull();
    expect(database.state.challenges).toHaveLength(0);
  });
});

describe("token-bound resend recovery", () => {
  it("immediately scrubs an abandoned failed delivery while retaining recoverable setup", async () => {
    const database = memoryDatabase();
    const first = challengeDraft(1);
    await register(database, first, "Reader", "reader-hash");

    await markVerificationChallengeDeliveryFailed(
      database.prisma,
      first.id,
      start,
    );

    expect(activeChallenge(database)).toMatchObject({
      deliveryFailedAt: start,
      scheduledAt: start,
      codeHash: null,
      pendingTokenHash: null,
      candidateDisplayName: null,
      candidatePasswordHash: null,
    });
    expect(database.state.pendingRegistration).toMatchObject({
      id: first.id,
      candidateDisplayName: "Reader",
      candidatePasswordHash: "reader-hash",
    });
  });

  it("preserves a matching token and performs no write inside scheduled cooldown", async () => {
    const database = memoryDatabase();
    const first = challengeDraft(1);
    await register(database, first, "Reader", "reader-hash");
    await markVerificationChallengeDeliveryFailed(database.prisma, first.id, start);

    const resend = challengeDraft(2, new Date(start.getTime() + 59_000));
    await expect(
      prepareVerificationResend(
        database.prisma,
        "reader@example.com",
        resend,
        secret,
        first.pendingToken,
        resend.createdAt,
      ),
    ).resolves.toEqual({
      kind: "accepted",
      retainedPendingToken: first.pendingToken,
    });
    expect(database.state.challenges).toHaveLength(1);
    expect(database.state.pendingRegistration?.tokenHash).toBe(
      hashPendingVerificationToken(
        secret,
        first.id,
        "reader@example.com",
        first.pendingToken,
      ),
    );
  });

  it("gives a mismatched-token resend decoy acceptance without rotation or invalidation", async () => {
    const database = memoryDatabase();
    const first = challengeDraft(1);
    await register(database, first, "Reader", "reader-hash");
    const originalTokenHash = database.state.pendingRegistration?.tokenHash;

    await expect(
      prepareVerificationResend(
        database.prisma,
        "reader@example.com",
        challengeDraft(2, new Date(start.getTime() + 61_000)),
        secret,
        "z".repeat(43),
        new Date(start.getTime() + 61_000),
      ),
    ).resolves.toEqual({ kind: "accepted" });
    expect(database.state.challenges).toHaveLength(1);
    expect(database.state.pendingRegistration?.tokenHash).toBe(originalTokenHash);
    expect(activeChallenge(database).invalidatedAt).toBeNull();
  });

  it("recovers a failed delivery after cooldown without re-entering signup", async () => {
    const database = memoryDatabase();
    const first = challengeDraft(1);
    await register(database, first, "Reader", "reader-hash");
    await markVerificationChallengeDeliveryFailed(database.prisma, first.id, start);
    const resend = challengeDraft(2, new Date(start.getTime() + 60_000));

    await expect(
      prepareVerificationResend(
        database.prisma,
        "reader@example.com",
        resend,
        secret,
        first.pendingToken,
        resend.createdAt,
      ),
    ).resolves.toMatchObject({ kind: "dispatch", challengeId: resend.id });
    expect(database.state.challenges[0]).toMatchObject({
      invalidatedAt: resend.createdAt,
      codeHash: null,
      candidatePasswordHash: null,
    });
    expect(activeChallenge(database)).toMatchObject({
      candidateDisplayName: "Reader",
      candidatePasswordHash: "reader-hash",
      deliveryFailedAt: null,
    });
  });

  it.each(["expired", "exhausted"] as const)(
    "recovers a token-owned %s code while the staged registration is live",
    async (terminalState) => {
      const database = memoryDatabase();
      const first = challengeDraft(1);
      await register(database, first, "Reader", "reader-hash");
      await markVerificationChallengeDispatched(database.prisma, first.id, start);
      const terminalTime = new Date(
        start.getTime() + (terminalState === "expired" ? 601_000 : 30_000),
      );
      if (terminalState === "exhausted") {
        activeChallenge(database).attemptCount = 5;
      }
      await expect(
        verifyEmailCode(
          database.prisma,
          "reader@example.com",
          first.code,
          first.pendingToken,
          secret,
          terminalTime,
        ),
      ).resolves.toEqual({ kind: "invalid" });
      expect(activeChallenge(database)).toMatchObject({
        codeHash: null,
        pendingTokenHash: null,
        candidateDisplayName: null,
        candidatePasswordHash: null,
      });
      expect(database.state.pendingRegistration).not.toBeNull();

      if (terminalState === "exhausted") {
        const tokenHash = database.state.pendingRegistration?.tokenHash;
        await expect(
          prepareVerificationResend(
            database.prisma,
            "reader@example.com",
            challengeDraft(2, terminalTime),
            secret,
            first.pendingToken,
            terminalTime,
          ),
        ).resolves.toEqual({
          kind: "accepted",
          retainedPendingToken: first.pendingToken,
        });
        expect(database.state.challenges).toHaveLength(1);
        expect(database.state.pendingRegistration?.tokenHash).toBe(tokenHash);
      }

      const resendTime =
        terminalState === "exhausted"
          ? new Date(start.getTime() + 60_000)
          : terminalTime;
      const resend = challengeDraft(2, resendTime);
      await expect(
        prepareVerificationResend(
          database.prisma,
          "reader@example.com",
          resend,
          secret,
          first.pendingToken,
          resendTime,
        ),
      ).resolves.toMatchObject({ kind: "dispatch", challengeId: resend.id });
      await markVerificationChallengeDispatched(
        database.prisma,
        resend.id,
        resendTime,
      );
      await expect(
        verifyEmailCode(
          database.prisma,
          "reader@example.com",
          resend.code,
          resend.pendingToken,
          secret,
          resendTime,
        ),
      ).resolves.toMatchObject({ kind: "verified" });
    },
  );

  it("scrubs and discards staged registration at the exact twenty-four-hour boundary", async () => {
    const database = memoryDatabase();
    const first = challengeDraft(1);
    await register(database, first, "Reader", "reader-hash");
    const expiresAt = new Date(
      start.getTime() + PENDING_REGISTRATION_EXPIRES_IN_SECONDS * 1_000,
    );

    await expect(
      prepareVerificationResend(
        database.prisma,
        "reader@example.com",
        challengeDraft(2, expiresAt),
        secret,
        first.pendingToken,
        expiresAt,
      ),
    ).resolves.toEqual({ kind: "accepted" });
    expect(database.state.pendingRegistration).toBeNull();
    expect(activeChallenge(database)).toMatchObject({
      codeHash: null,
      pendingTokenHash: null,
      candidateDisplayName: null,
      candidatePasswordHash: null,
      invalidatedAt: expiresAt,
      pendingRegistrationId: null,
    });
  });

  it("refuses verification and scrubs the stage at the exact twenty-four-hour boundary", async () => {
    const database = memoryDatabase();
    const first = challengeDraft(1);
    await register(database, first, "Reader", "reader-hash");
    await markVerificationChallengeDispatched(database.prisma, first.id, start);
    activeChallenge(database).expiresAt = new Date(
      start.getTime() +
        (PENDING_REGISTRATION_EXPIRES_IN_SECONDS + 60) * 1_000,
    );
    const expiresAt = new Date(
      start.getTime() + PENDING_REGISTRATION_EXPIRES_IN_SECONDS * 1_000,
    );

    await expect(
      verifyEmailCode(
        database.prisma,
        "reader@example.com",
        first.code,
        first.pendingToken,
        secret,
        expiresAt,
      ),
    ).resolves.toEqual({ kind: "invalid" });
    expect(database.state.pendingRegistration).toBeNull();
    expect(activeChallenge(database)).toMatchObject({
      invalidatedAt: expiresAt,
      codeHash: null,
      pendingTokenHash: null,
      candidateDisplayName: null,
      candidatePasswordHash: null,
      pendingRegistrationId: null,
    });
    expect(database.state.user?.emailVerifiedAt).toBeNull();
  });
});

describe("verification attempt handling", () => {
  it("does not consume code attempts for a missing or wrong pending token", async () => {
    const database = memoryDatabase();
    const draft = challengeDraft(1);
    await register(database, draft, "Reader", "reader-hash");
    await markVerificationChallengeDispatched(database.prisma, draft.id, start);

    for (const token of ["", "z".repeat(43)]) {
      await expect(
        verifyEmailCode(
          database.prisma,
          "reader@example.com",
          "999999",
          token,
          secret,
          start,
        ),
      ).resolves.toEqual({ kind: "invalid" });
    }
    expect(activeChallenge(database).attemptCount).toBe(0);
  });

  it("counts wrong codes only with the valid token and scrubs the fifth failure", async () => {
    const database = memoryDatabase();
    const draft = challengeDraft(1);
    await register(database, draft, "Reader", "reader-hash");
    await markVerificationChallengeDispatched(database.prisma, draft.id, start);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await verifyEmailCode(
        database.prisma,
        "reader@example.com",
        "999999",
        draft.pendingToken,
        secret,
        start,
      );
    }
    expect(activeChallenge(database)).toMatchObject({
      attemptCount: 5,
      invalidatedAt: start,
      codeHash: null,
      pendingTokenHash: null,
      candidateDisplayName: null,
      candidatePasswordHash: null,
    });
  });

  it("consumes a successful challenge once and never authenticates replay", async () => {
    const database = memoryDatabase();
    const draft = challengeDraft(1);
    await register(database, draft, "Reader", "reader-hash");
    await markVerificationChallengeDispatched(database.prisma, draft.id, start);

    await expect(
      verifyEmailCode(
        database.prisma,
        "reader@example.com",
        draft.code,
        draft.pendingToken,
        secret,
        start,
      ),
    ).resolves.toMatchObject({ kind: "verified" });
    await expect(
      verifyEmailCode(
        database.prisma,
        "reader@example.com",
        draft.code,
        draft.pendingToken,
        secret,
        start,
      ),
    ).resolves.toEqual({ kind: "invalid" });
    expect(database.transaction.user.update).toHaveBeenCalledTimes(1);
  });
});
