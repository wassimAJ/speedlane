import {
  apiErrorResponseSchema,
  profileResponseSchema,
  registerResponseSchema,
  verifyEmailResponseSchema,
  type AuthenticatedUser,
  type Profile,
} from "@amazon-2/contracts";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createApp, type AppConfig, type AppDatabase } from "../app.js";
import { createSessionToken } from "../auth/token.js";
import { PENDING_VERIFICATION_COOKIE_NAME } from "./pending-cookie.js";
import type { AccountStore, BackgroundTaskScheduler } from "./routes.js";
import type { VerificationChallengeDraft } from "./verification-code.js";

const config: AppConfig = {
  corsOrigin: "http://localhost:5173",
  jwtSecret: "test-only-secret-with-more-than-thirty-two-characters",
  sessionTtlSeconds: 900,
  secureCookie: false,
};
const now = new Date("2026-08-01T10:00:00.000Z");
const user: AuthenticatedUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "reader@example.com",
  displayName: "Riley Reader",
  role: "READER",
};
const profile: Profile = {
  ...user,
  emailVerifiedAt: "2026-08-01T10:00:00.000Z",
  createdAt: "2026-08-01T09:00:00.000Z",
};
const authenticationUser = {
  ...user,
  emailVerifiedAt: new Date(profile.emailVerifiedAt),
};
const draft: VerificationChallengeDraft = {
  id: "00000000-0000-4000-8000-000000000111",
  code: "123456",
  pendingToken: "a".repeat(43),
  createdAt: now,
  expiresAt: new Date("2026-08-01T10:10:00.000Z"),
};

function accountStore(overrides: Partial<AccountStore> = {}): AccountStore {
  return {
    findUserById: vi.fn().mockResolvedValue(authenticationUser),
    prepareReaderRegistration: vi.fn().mockResolvedValue({
      kind: "dispatch",
      challengeId: draft.id,
      email: "reader@example.com",
    }),
    prepareVerificationResend: vi.fn().mockResolvedValue({ kind: "accepted" }),
    markVerificationChallengeDispatched: vi.fn().mockResolvedValue(undefined),
    invalidateVerificationChallenge: vi.fn().mockResolvedValue(undefined),
    markVerificationChallengeDeliveryFailed: vi.fn().mockResolvedValue(undefined),
    verifyEmailCode: vi.fn().mockResolvedValue({ kind: "verified", user }),
    findProfileById: vi.fn().mockResolvedValue(profile),
    updateProfileDisplayName: vi.fn().mockImplementation(async (_id, displayName) => ({
      ...profile,
      displayName,
    })),
    ...overrides,
  };
}

function accountApp(store: AccountStore, mailDelivery = {
  available: true,
  sendVerificationCode: vi.fn().mockResolvedValue(undefined),
}, schedule?: BackgroundTaskScheduler) {
  return {
    app: createApp({} as AppDatabase, config, {
      account: {
        store,
        mailDelivery,
        now: () => now,
        createChallenge: () => draft,
        schedule,
      },
    }),
    mailDelivery,
  };
}

function capturedScheduler() {
  const tasks: Array<() => Promise<void>> = [];
  return {
    tasks,
    schedule: (task: () => Promise<void>) => {
      tasks.push(task);
    },
  };
}

function sessionCookie() {
  return `amazon2_session=${createSessionToken(user.id, {
    secret: config.jwtSecret,
    ttlSeconds: config.sessionTtlSeconds,
  })}`;
}

function pendingCookie(token = draft.pendingToken) {
  return `${PENDING_VERIFICATION_COOKIE_NAME}=${token}`;
}

describe("account routes", () => {
  it("registers a reader publicly, sends the code, and exposes no internal fields", async () => {
    const store = accountStore();
    const background = capturedScheduler();
    const { app, mailDelivery } = accountApp(
      store,
      undefined,
      background.schedule,
    );
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        displayName: " Riley Reader ",
        email: " READER@Example.com ",
        password: "StrongReader123",
      })
      .expect(202);

    expect(registerResponseSchema.parse(response.body)).toEqual({
      verification: {
        email: "reader@example.com",
        codeLength: 6,
        expiresInSeconds: 600,
        resendCooldownSeconds: 60,
      },
    });
    expect(response.headers["set-cookie"]?.[0]).toContain(
      `${PENDING_VERIFICATION_COOKIE_NAME}=${draft.pendingToken}`,
    );
    expect(response.headers["set-cookie"]?.[0]).toContain("Max-Age=86400");
    expect(response.headers["set-cookie"]?.[0]).toContain("Path=/api/auth");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]?.[0]).toContain("SameSite=Lax");
    expect(store.prepareReaderRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Riley Reader",
        email: "reader@example.com",
        passwordHash: expect.stringMatching(/^scrypt\$/),
      }),
      draft,
      now,
    );
    expect(background.tasks).toHaveLength(1);
    await background.tasks[0]?.();
    expect(mailDelivery.sendVerificationCode).toHaveBeenCalledWith({
      to: "reader@example.com",
      code: "123456",
    });
    expect(store.markVerificationChallengeDispatched).toHaveBeenCalledWith(draft.id, now);
    expect(JSON.stringify(response.body)).not.toContain("password");
  });

  it("rejects client-selected privileged fields before touching persistence", async () => {
    const store = accountStore();
    const response = await request(accountApp(store).app)
      .post("/api/auth/register")
      .send({
        displayName: "Riley Reader",
        email: "reader@example.com",
        password: "StrongReader123",
        role: "LIBRARIAN",
      })
      .expect(400);

    expect(apiErrorResponseSchema.parse(response.body).error.code).toBe("INVALID_REQUEST");
    expect(store.prepareReaderRegistration).not.toHaveBeenCalled();
  });

  it("returns generic 202 and marks delivery failure asynchronously when configured mail fails", async () => {
    const store = accountStore();
    const background = capturedScheduler();
    const unhandledRejection = vi.fn();
    process.on("unhandledRejection", unhandledRejection);
    const response = await request(
      accountApp(store, {
        available: true,
        sendVerificationCode: vi.fn().mockRejectedValue(new Error("provider detail")),
      }, background.schedule).app,
    )
      .post("/api/auth/register")
      .send({
        displayName: "Riley Reader",
        email: "reader@example.com",
        password: "StrongReader123",
      })
      .expect(202);

    expect(registerResponseSchema.parse(response.body).verification.email).toBe(
      "reader@example.com",
    );
    expect(store.invalidateVerificationChallenge).not.toHaveBeenCalled();
    expect(background.tasks).toHaveLength(1);
    await expect(background.tasks[0]?.()).resolves.toBeUndefined();
    await Promise.resolve();
    expect(
      store.markVerificationChallengeDeliveryFailed,
    ).toHaveBeenCalledWith(draft.id, now);
    expect(store.invalidateVerificationChallenge).not.toHaveBeenCalled();
    expect(store.markVerificationChallengeDispatched).not.toHaveBeenCalled();
    expect(unhandledRejection).not.toHaveBeenCalled();
    process.off("unhandledRejection", unhandledRejection);
    expect(JSON.stringify(response.body)).not.toContain("provider detail");
  });

  it("does not await configured provider latency before returning 202", async () => {
    let releaseDelivery: (() => void) | undefined;
    const delayedDelivery = new Promise<void>((resolve) => {
      releaseDelivery = resolve;
    });
    let backgroundTask: Promise<void> | undefined;
    const store = accountStore();
    const { app } = accountApp(
      store,
      {
        available: true,
        sendVerificationCode: vi.fn(() => delayedDelivery),
      },
      (task) => {
        backgroundTask = task();
      },
    );

    const outcome = await Promise.race([
      request(app)
        .post("/api/auth/register")
        .send({
          displayName: "Riley Reader",
          email: "reader@example.com",
          password: "StrongReader123",
        })
        .then((response) => response),
      new Promise<"timeout">((resolve) => {
        setTimeout(() => resolve("timeout"), 250);
      }),
    ]);

    expect(outcome).not.toBe("timeout");
    if (outcome === "timeout") {
      return;
    }
    expect(outcome.status).toBe(202);
    expect(store.markVerificationChallengeDispatched).not.toHaveBeenCalled();
    releaseDelivery?.();
    await backgroundTask;
    expect(store.markVerificationChallengeDispatched).toHaveBeenCalledWith(
      draft.id,
      now,
    );
  });

  it("verifies email publicly and establishes the normal session cookie", async () => {
    const store = accountStore();
    const response = await request(accountApp(store).app)
      .post("/api/auth/verify-email")
      .set("Cookie", pendingCookie())
      .send({ email: "READER@example.com", code: "123456" })
      .expect(200);

    expect(verifyEmailResponseSchema.parse(response.body)).toEqual({ user });
    expect(store.verifyEmailCode).toHaveBeenCalledWith(
      "reader@example.com",
      "123456",
      draft.pendingToken,
      now,
    );
    const setCookies = response.headers["set-cookie"] ?? [];
    expect(
      setCookies.some((cookie) =>
        cookie.startsWith(`${PENDING_VERIFICATION_COOKIE_NAME}=`),
      ),
    ).toBe(true);
    expect(
      setCookies.some((cookie) => cookie.startsWith("amazon2_session=")),
    ).toBe(true);
  });

  it("keeps email verification available when outbound mail is unconfigured", async () => {
    const store = accountStore();
    const response = await request(
      accountApp(store, {
        available: false,
        sendVerificationCode: vi.fn().mockRejectedValue(new Error("unavailable")),
      }).app,
    )
      .post("/api/auth/verify-email")
      .set("Cookie", pendingCookie())
      .send({ email: "reader@example.com", code: draft.code })
      .expect(200);

    expect(verifyEmailResponseSchema.parse(response.body)).toEqual({ user });
    expect(store.verifyEmailCode).toHaveBeenCalledOnce();
  });

  it("uses one generic error for an invalid verification state", async () => {
    const store = accountStore({
      verifyEmailCode: vi.fn().mockResolvedValue({ kind: "invalid" }),
    });
    const response = await request(accountApp(store).app)
      .post("/api/auth/verify-email")
      .send({ email: "reader@example.com", code: "999999" })
      .expect(400);

    expect(apiErrorResponseSchema.parse(response.body)).toEqual({
      error: {
        code: "VERIFICATION_CODE_INVALID",
        message: "Verification code is invalid or expired.",
      },
    });
    expect(store.verifyEmailCode).toHaveBeenCalledWith(
      "reader@example.com",
      "999999",
      "",
      now,
    );
  });

  it("never establishes a second session when a code is replayed", async () => {
    const verify = vi
      .fn()
      .mockResolvedValueOnce({ kind: "verified", user })
      .mockResolvedValueOnce({ kind: "invalid" });
    const app = accountApp(accountStore({ verifyEmailCode: verify })).app;

    const first = await request(app)
      .post("/api/auth/verify-email")
      .set("Cookie", pendingCookie())
      .send({ email: "reader@example.com", code: "123456" })
      .expect(200);
    const replay = await request(app)
      .post("/api/auth/verify-email")
      .set("Cookie", pendingCookie())
      .send({ email: "reader@example.com", code: "123456" })
      .expect(400);

    expect(
      (first.headers["set-cookie"] ?? []).some((cookie) =>
        cookie.startsWith("amazon2_session="),
      ),
    ).toBe(true);
    expect(replay.headers["set-cookie"]).toBeUndefined();
    expect(apiErrorResponseSchema.parse(replay.body).error.code).toBe(
      "VERIFICATION_CODE_INVALID",
    );
  });

  it("returns a generic 429 with Retry-After after the verification limit", async () => {
    const store = accountStore({
      verifyEmailCode: vi.fn().mockResolvedValue({ kind: "invalid" }),
    });
    const app = accountApp(store).app;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app)
        .post("/api/auth/verify-email")
        .send({ email: "reader@example.com", code: "999999" })
        .expect(400);
    }
    const response = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "reader@example.com", code: "999999" })
      .expect(429);

    expect(apiErrorResponseSchema.parse(response.body).error.code).toBe("RATE_LIMITED");
    expect(response.headers["retry-after"]).toBe("900");
    expect(store.verifyEmailCode).toHaveBeenCalledTimes(10);
  });

  it("returns enumeration-resistant resend acceptance without mailing unknown users", async () => {
    const store = accountStore({
      prepareVerificationResend: vi.fn().mockResolvedValue({ kind: "accepted" }),
    });
    const { app, mailDelivery } = accountApp(store);
    const response = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: "missing@example.com" })
      .expect(202);

    expect(registerResponseSchema.parse(response.body).verification.email).toBe(
      "missing@example.com",
    );
    expect(response.headers["set-cookie"]?.[0]).toContain(
      `${PENDING_VERIFICATION_COOKIE_NAME}=${draft.pendingToken}`,
    );
    expect(response.headers["set-cookie"]?.[0]).toContain("Max-Age=86400");
    expect(store.prepareVerificationResend).toHaveBeenCalledWith(
      "missing@example.com",
      draft,
      null,
      now,
    );
    expect(mailDelivery.sendVerificationCode).not.toHaveBeenCalled();
  });

  it("retains the owned pending cookie without writing or mailing inside resend cooldown", async () => {
    const store = accountStore({
      prepareVerificationResend: vi.fn().mockResolvedValue({
        kind: "accepted",
        retainedPendingToken: draft.pendingToken,
      }),
    });
    const background = capturedScheduler();
    const { app, mailDelivery } = accountApp(
      store,
      undefined,
      background.schedule,
    );

    const response = await request(app)
      .post("/api/auth/resend-verification")
      .set("Cookie", pendingCookie())
      .send({ email: "reader@example.com" })
      .expect(202);

    expect(response.headers["set-cookie"]?.[0]).toContain(
      `${PENDING_VERIFICATION_COOKIE_NAME}=${draft.pendingToken}`,
    );
    expect(background.tasks).toHaveLength(0);
    expect(mailDelivery.sendVerificationCode).not.toHaveBeenCalled();
    expect(store.markVerificationChallengeDispatched).not.toHaveBeenCalled();
  });

  it("keeps configured dispatch and accepted registration responses indistinguishable", async () => {
    const prepare = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "dispatch",
        challengeId: draft.id,
        email: "reader@example.com",
      })
      .mockResolvedValueOnce({ kind: "accepted" });
    const store = accountStore({ prepareReaderRegistration: prepare });
    const background = capturedScheduler();
    const { app, mailDelivery } = accountApp(
      store,
      undefined,
      background.schedule,
    );
    const input = {
      displayName: "Riley Reader",
      email: "reader@example.com",
      password: "StrongReader123",
    };

    const first = await request(app)
      .post("/api/auth/register")
      .send(input)
      .expect(202);
    const duplicate = await request(app)
      .post("/api/auth/register")
      .send({
        ...input,
        displayName: "Attacker Name",
        password: "AttackerReader456",
      })
      .expect(202);

    expect(duplicate.body).toEqual(first.body);
    const normalizeCookieExpiry = (cookie: string | undefined) =>
      cookie?.replace(/Expires=[^;]+/u, "Expires=<wall-clock>");
    expect(normalizeCookieExpiry(duplicate.headers["set-cookie"]?.[0])).toBe(
      normalizeCookieExpiry(first.headers["set-cookie"]?.[0]),
    );
    expect(background.tasks).toHaveLength(1);
    await background.tasks[0]?.();
    expect(mailDelivery.sendVerificationCode).toHaveBeenCalledTimes(1);
    expect(store.markVerificationChallengeDispatched).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["unknown", { kind: "accepted" }],
    ["verified", { kind: "accepted" }],
    [
      "unverified",
      {
        kind: "dispatch",
        challengeId: draft.id,
        email: "reader@example.com",
      },
    ],
  ] as const)(
    "returns the same pre-store 503 for %s registration when mail is unavailable",
    async (_state, preparation) => {
      const prepare = vi.fn().mockResolvedValue(preparation);
      const store = accountStore({ prepareReaderRegistration: prepare });
      const response = await request(
        accountApp(store, {
          available: false,
          sendVerificationCode: vi.fn().mockRejectedValue(new Error("unavailable")),
        }).app,
      )
        .post("/api/auth/register")
        .send({
          displayName: "Riley Reader",
          email: "reader@example.com",
          password: "StrongReader123",
        })
        .expect(503);

      expect(apiErrorResponseSchema.parse(response.body)).toEqual({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Verification email could not be sent. Please try again.",
        },
      });
      expect(prepare).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["unknown", { kind: "accepted" }],
    ["verified", { kind: "accepted" }],
    [
      "unverified",
      {
        kind: "dispatch",
        challengeId: draft.id,
        email: "reader@example.com",
      },
    ],
  ] as const)(
    "returns the same pre-store 503 for %s resend when mail is unavailable",
    async (_state, preparation) => {
      const prepare = vi.fn().mockResolvedValue(preparation);
      const store = accountStore({ prepareVerificationResend: prepare });
      const response = await request(
        accountApp(store, {
          available: false,
          sendVerificationCode: vi.fn().mockRejectedValue(new Error("unavailable")),
        }).app,
      )
        .post("/api/auth/resend-verification")
        .send({ email: "reader@example.com" })
        .expect(503);

      expect(apiErrorResponseSchema.parse(response.body)).toEqual({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Verification email could not be sent. Please try again.",
        },
      });
      expect(prepare).not.toHaveBeenCalled();
    },
  );

  it("mails and activates an unverified resend dispatch", async () => {
    const store = accountStore({
      prepareVerificationResend: vi.fn().mockResolvedValue({
        kind: "dispatch",
        challengeId: draft.id,
        email: "reader@example.com",
      }),
    });
    const background = capturedScheduler();
    const { app, mailDelivery } = accountApp(
      store,
      undefined,
      background.schedule,
    );

    await request(app)
      .post("/api/auth/resend-verification")
      .set("Cookie", pendingCookie())
      .send({ email: "reader@example.com" })
      .expect(202);

    expect(store.prepareVerificationResend).toHaveBeenCalledWith(
      "reader@example.com",
      draft,
      draft.pendingToken,
      now,
    );
    expect(background.tasks).toHaveLength(1);
    await background.tasks[0]?.();
    expect(mailDelivery.sendVerificationCode).toHaveBeenCalledWith({
      to: "reader@example.com",
      code: draft.code,
    });
    expect(store.markVerificationChallengeDispatched).toHaveBeenCalledWith(
      draft.id,
      now,
    );
  });

  it("enforces registration and resend rate limits at the route boundary", async () => {
    const registrationStore = accountStore({
      prepareReaderRegistration: vi.fn().mockResolvedValue({ kind: "accepted" }),
    });
    const registrationApp = accountApp(registrationStore).app;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(registrationApp)
        .post("/api/auth/register")
        .send({
          displayName: "Riley Reader",
          email: "reader@example.com",
          password: "StrongReader123",
        })
        .expect(202);
    }
    const registrationLimit = await request(registrationApp)
      .post("/api/auth/register")
      .send({
        displayName: "Riley Reader",
        email: "reader@example.com",
        password: "StrongReader123",
      })
      .expect(429);
    expect(registrationLimit.headers["retry-after"]).toBe("900");
    expect(registrationStore.prepareReaderRegistration).toHaveBeenCalledTimes(5);

    const resendStore = accountStore();
    const resendApp = accountApp(resendStore).app;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(resendApp)
        .post("/api/auth/resend-verification")
        .send({ email: "reader@example.com" })
        .expect(202);
    }
    const resendLimit = await request(resendApp)
      .post("/api/auth/resend-verification")
      .send({ email: "reader@example.com" })
      .expect(429);
    expect(resendLimit.headers["retry-after"]).toBe("900");
    expect(resendStore.prepareVerificationResend).toHaveBeenCalledTimes(5);
  });

  it("requires authentication for profiles and only accepts displayName updates", async () => {
    const store = accountStore();
    const app = accountApp(store).app;

    await request(app).get("/api/me/profile").expect(401);
    const getResponse = await request(app)
      .get("/api/me/profile")
      .set("Cookie", sessionCookie())
      .expect(200);
    expect(profileResponseSchema.parse(getResponse.body)).toEqual({ profile });

    await request(app)
      .put("/api/me/profile")
      .set("Cookie", sessionCookie())
      .send({ displayName: "New Name", role: "LIBRARIAN" })
      .expect(400);
    const updateResponse = await request(app)
      .put("/api/me/profile")
      .set("Cookie", sessionCookie())
      .send({ displayName: " New Name " })
      .expect(200);
    expect(profileResponseSchema.parse(updateResponse.body).profile.displayName).toBe("New Name");
    expect(store.updateProfileDisplayName).toHaveBeenCalledWith(user.id, "New Name");
  });
});
