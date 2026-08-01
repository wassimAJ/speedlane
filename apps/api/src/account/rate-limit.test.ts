import { describe, expect, it } from "vitest";

import { AccountRateLimiter } from "./rate-limit.js";

describe("AccountRateLimiter", () => {
  it("blocks email rotation with an independent per-route IP bucket", () => {
    const limiter = new AccountRateLimiter();
    const start = new Date("2026-08-01T10:00:00.000Z");

    expect(limiter.consume("register", "127.0.0.1", "one@example.com", 2, start)).toEqual({ allowed: true });
    expect(limiter.consume("register", "127.0.0.1", "two@example.com", 2, start)).toEqual({ allowed: true });
    expect(
      limiter.consume(
        "register",
        "127.0.0.1",
        "three@example.com",
        2,
        new Date("2026-08-01T10:00:01.000Z"),
      ),
    ).toEqual({ allowed: false, retryAfterSeconds: 899 });
  });

  it("blocks IP rotation with an independent normalized-email bucket", () => {
    const limiter = new AccountRateLimiter();
    const start = new Date("2026-08-01T10:00:00.000Z");

    expect(limiter.consume("verify", "127.0.0.1", "Reader@Example.com", 2, start)).toEqual({ allowed: true });
    expect(limiter.consume("verify", "127.0.0.2", " reader@example.com ", 2, start)).toEqual({ allowed: true });
    expect(limiter.consume("verify", "127.0.0.3", "reader@example.com", 2, start)).toEqual({
      allowed: false,
      retryAfterSeconds: 900,
    });
  });

  it("starts a new fixed window after fifteen minutes", () => {
    const limiter = new AccountRateLimiter();
    const start = new Date("2026-08-01T10:00:00.000Z");
    limiter.consume("resend", "127.0.0.1", "reader@example.com", 1, start);

    expect(
      limiter.consume(
        "resend",
        "127.0.0.1",
        "reader@example.com",
        1,
        new Date("2026-08-01T10:15:00.000Z"),
      ),
    ).toEqual({ allowed: true });
  });

  it("bounds active memory and fails closed for unseen keys", () => {
    const limiter = new AccountRateLimiter(4);
    const start = new Date("2026-08-01T10:00:00.000Z");

    expect(limiter.consume("register", "127.0.0.1", "one@example.com", 5, start)).toEqual({ allowed: true });
    expect(limiter.consume("register", "127.0.0.2", "two@example.com", 5, start)).toEqual({ allowed: true });
    expect(limiter.bucketCount).toBe(4);
    expect(limiter.consume("register", "127.0.0.3", "three@example.com", 5, start)).toEqual({
      allowed: false,
      retryAfterSeconds: 900,
    });
    expect(limiter.bucketCount).toBe(4);
  });
});
