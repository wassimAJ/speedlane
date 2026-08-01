import { describe, expect, it } from "vitest";

import { createSessionToken, verifySessionToken, type TokenConfig } from "./token.js";

const userId = "00000000-0000-4000-8000-000000000001";
const config: TokenConfig = {
  secret: "test-only-secret-with-more-than-thirty-two-characters",
  ttlSeconds: 900,
};
const issuedAt = new Date("2026-08-01T08:00:00.000Z");

describe("session tokens", () => {
  it("contains only standard session claims and verifies before expiry", () => {
    const token = createSessionToken(userId, config, issuedAt);
    const issuedAtSeconds = Math.floor(issuedAt.getTime() / 1_000);
    const encodedPayload = token.split(".")[1];
    const payload = JSON.parse(
      Buffer.from(encodedPayload ?? "", "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    expect(payload).toEqual({
      sub: userId,
      iss: "amazon-2-api",
      aud: "amazon-2-web",
      iat: issuedAtSeconds,
      exp: issuedAtSeconds + config.ttlSeconds,
    });
    expect(payload).not.toHaveProperty("role");
    expect(payload).not.toHaveProperty("email");
    expect(verifySessionToken(token, config, new Date("2026-08-01T08:14:59.000Z"))).toBe(
      userId,
    );
  });

  it("rejects expired and tampered tokens", () => {
    const token = createSessionToken(userId, config, issuedAt);
    const tamperedToken = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(verifySessionToken(token, config, new Date("2026-08-01T08:15:00.000Z"))).toBeNull();
    expect(verifySessionToken(tamperedToken, config, issuedAt)).toBeNull();
  });
});
