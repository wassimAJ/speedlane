import { describe, expect, it } from "vitest";

import { readEnvironment } from "./env.js";

const baseEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://amazon2:password@localhost:5432/amazon2",
  CORS_ORIGIN: "http://localhost:5173",
  JWT_SECRET: "test-only-secret-with-more-than-thirty-two-characters",
};

describe("email delivery environment", () => {
  it("keeps the API usable when both optional Resend values are omitted or blank", () => {
    expect(readEnvironment(baseEnvironment).RESEND_API_KEY).toBeUndefined();
    expect(
      readEnvironment({
        ...baseEnvironment,
        RESEND_API_KEY: "",
        RESEND_FROM_EMAIL: "  ",
      }).RESEND_FROM_EMAIL,
    ).toBeUndefined();
  });

  it.each([
    "accounts@example.com",
    "Amazon 2.0 <accounts@example.com>",
  ])("accepts the valid sender form %s", (sender) => {
    const environment = readEnvironment({
      ...baseEnvironment,
      RESEND_API_KEY: "re_test_key",
      RESEND_FROM_EMAIL: sender,
    });

    expect(environment.RESEND_API_KEY).toBe("re_test_key");
    expect(environment.RESEND_FROM_EMAIL).toBe(sender);
  });

  it("rejects partial Resend configuration", () => {
    expect(() =>
      readEnvironment({
        ...baseEnvironment,
        RESEND_API_KEY: "re_test_key",
      }),
    ).toThrow(/RESEND_API_KEY and RESEND_FROM_EMAIL/);
  });

  it.each([
    "not-an-email",
    "Amazon 2.0 accounts@example.com",
    "Amazon 2.0 <not-an-email>",
    "Bad\nName <accounts@example.com>",
  ])("rejects the malformed sender form %s", (sender) => {
    expect(() =>
      readEnvironment({
        ...baseEnvironment,
        RESEND_API_KEY: "re_test_key",
        RESEND_FROM_EMAIL: sender,
      }),
    ).toThrow(/RESEND_FROM_EMAIL/);
  });
});
