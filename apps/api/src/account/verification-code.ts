import {
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import {
  EMAIL_VERIFICATION_CODE_LENGTH,
  EMAIL_VERIFICATION_EXPIRES_IN_SECONDS,
} from "@amazon-2/contracts";

const VERIFICATION_HASH_DOMAIN = "amazon-2:email-verification:v1";
const PENDING_TOKEN_HASH_DOMAIN = "amazon-2:pending-verification-token:v1";
const PENDING_TOKEN_BYTES = 32;

export interface VerificationChallengeDraft {
  id: string;
  code: string;
  pendingToken: string;
  createdAt: Date;
  expiresAt: Date;
}

export function generateVerificationCode() {
  const upperBound = 10 ** EMAIL_VERIFICATION_CODE_LENGTH;
  return randomInt(0, upperBound)
    .toString()
    .padStart(EMAIL_VERIFICATION_CODE_LENGTH, "0");
}

export function createVerificationChallengeDraft(
  now = new Date(),
  code = generateVerificationCode(),
  id = randomUUID(),
  pendingToken = randomBytes(PENDING_TOKEN_BYTES).toString("base64url"),
): VerificationChallengeDraft {
  return {
    id,
    code,
    pendingToken,
    createdAt: now,
    expiresAt: new Date(
      now.getTime() + EMAIL_VERIFICATION_EXPIRES_IN_SECONDS * 1_000,
    ),
  };
}

function keyedChallengeHash(
  domain: string,
  secret: string,
  challengeId: string,
  normalizedEmail: string,
  value: string,
) {
  return createHmac("sha256", secret)
    .update(domain, "utf8")
    .update("\0", "utf8")
    .update(challengeId, "utf8")
    .update("\0", "utf8")
    .update(normalizedEmail, "utf8")
    .update("\0", "utf8")
    .update(value, "utf8")
    .digest("hex");
}

export function hashVerificationCode(
  secret: string,
  challengeId: string,
  normalizedEmail: string,
  code: string,
) {
  return keyedChallengeHash(
    VERIFICATION_HASH_DOMAIN,
    secret,
    challengeId,
    normalizedEmail,
    code,
  );
}

export function verificationCodeMatches(
  storedHash: string,
  secret: string,
  challengeId: string,
  normalizedEmail: string,
  code: string,
) {
  if (!/^[a-f\d]{64}$/u.test(storedHash)) {
    return false;
  }

  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(
    hashVerificationCode(secret, challengeId, normalizedEmail, code),
    "hex",
  );

  return timingSafeEqual(actual, expected);
}

export function hashPendingVerificationToken(
  secret: string,
  challengeId: string,
  normalizedEmail: string,
  pendingToken: string,
) {
  return keyedChallengeHash(
    PENDING_TOKEN_HASH_DOMAIN,
    secret,
    challengeId,
    normalizedEmail,
    pendingToken,
  );
}

export function pendingVerificationTokenMatches(
  storedHash: string,
  secret: string,
  challengeId: string,
  normalizedEmail: string,
  pendingToken: string,
) {
  if (!/^[a-f\d]{64}$/u.test(storedHash)) {
    return false;
  }

  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(
    hashPendingVerificationToken(
      secret,
      challengeId,
      normalizedEmail,
      pendingToken,
    ),
    "hex",
  );

  return timingSafeEqual(actual, expected);
}
