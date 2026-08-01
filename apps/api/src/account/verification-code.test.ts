import { describe, expect, it } from "vitest";

import {
  createVerificationChallengeDraft,
  hashPendingVerificationToken,
  hashVerificationCode,
  pendingVerificationTokenMatches,
  verificationCodeMatches,
} from "./verification-code.js";

const secret = "test-only-secret-with-more-than-thirty-two-characters";

describe("email verification codes", () => {
  it("generates six numeric digits with a ten-minute expiry", () => {
    const now = new Date("2026-08-01T10:00:00.000Z");
    const draft = createVerificationChallengeDraft(now);

    expect(draft.code).toMatch(/^\d{6}$/);
    expect(draft.pendingToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(draft.createdAt).toEqual(now);
    expect(draft.expiresAt.toISOString()).toBe("2026-08-01T10:10:00.000Z");
  });

  it("uses domain-separated keyed hashes bound to challenge and email", () => {
    const hash = hashVerificationCode(
      secret,
      "00000000-0000-4000-8000-000000000111",
      "reader@example.com",
      "123456",
    );

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("123456");
    expect(
      verificationCodeMatches(
        hash,
        secret,
        "00000000-0000-4000-8000-000000000111",
        "reader@example.com",
        "123456",
      ),
    ).toBe(true);
    expect(
      verificationCodeMatches(
        hash,
        secret,
        "00000000-0000-4000-8000-000000000112",
        "reader@example.com",
        "123456",
      ),
    ).toBe(false);
    expect(
      verificationCodeMatches(
        hash,
        secret,
        "00000000-0000-4000-8000-000000000111",
        "other@example.com",
        "123456",
      ),
    ).toBe(false);
  });

  it("uses a separate keyed hash for browser-bound pending tokens", () => {
    const challengeId = "00000000-0000-4000-8000-000000000111";
    const email = "reader@example.com";
    const pendingToken = "a".repeat(43);
    const tokenHash = hashPendingVerificationToken(
      secret,
      challengeId,
      email,
      pendingToken,
    );

    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHash).not.toBe(
      hashVerificationCode(secret, challengeId, email, pendingToken),
    );
    expect(
      pendingVerificationTokenMatches(
        tokenHash,
        secret,
        challengeId,
        email,
        pendingToken,
      ),
    ).toBe(true);
    expect(
      pendingVerificationTokenMatches(
        tokenHash,
        secret,
        challengeId,
        "other@example.com",
        pendingToken,
      ),
    ).toBe(false);
    expect(
      pendingVerificationTokenMatches(
        tokenHash,
        secret,
        challengeId,
        email,
        "b".repeat(43),
      ),
    ).toBe(false);
  });
});
