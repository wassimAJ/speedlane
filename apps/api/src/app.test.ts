import { scryptSync } from "node:crypto";

import {
  apiErrorResponseSchema,
  sessionResponseSchema,
  type Role,
} from "@amazon-2/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createApp, type AppConfig, type AppDatabase, type AuthUserRecord } from "./app.js";

const config: AppConfig = {
  corsOrigin: "http://localhost:5173",
  jwtSecret: "test-only-secret-with-more-than-thirty-two-characters",
  sessionTtlSeconds: 900,
  secureCookie: false,
};

function encodedPassword(password: string, saltHex: string) {
  const workFactor = 16_384;
  const blockSize = 8;
  const parallelization = 1;
  const hash = scryptSync(password, Buffer.from(saltHex, "hex"), 64, {
    N: workFactor,
    r: blockSize,
    p: parallelization,
  });

  return `scrypt$${workFactor}$${blockSize}$${parallelization}$${saltHex}$${hash.toString("hex")}`;
}

function testUser(role: Role): AuthUserRecord {
  const librarian = role === "LIBRARIAN";

  return {
    id: librarian
      ? "00000000-0000-4000-8000-000000000002"
      : "00000000-0000-4000-8000-000000000001",
    email: librarian ? "librarian@amazon2.local" : "reader@amazon2.local",
    displayName: librarian ? "Morgan Librarian" : "Riley Reader",
    role,
    passwordHash: encodedPassword(
      librarian ? "LibrarianDemo123!" : "ReaderDemo123!",
      librarian ? "1e3cc494f174fd479912f7a5bb6fed90" : "5ca7371d2bf88a7ba0b246d2fd6147b1",
    ),
  };
}

function testDatabase(overrides: Partial<AppDatabase> = {}): AppDatabase {
  const users = [testUser("READER"), testUser("LIBRARIAN")];

  return {
    check: vi.fn().mockResolvedValue(undefined),
    findUserByEmail: vi.fn(async (email: string) => {
      return users.find((user) => user.email === email) ?? null;
    }),
    findUserById: vi.fn(async (id: string) => {
      const user = users.find((candidate) => candidate.id === id);

      if (user === undefined) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      };
    }),
    findPublicBookPreviews: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("returns the existing shared, database-backed health response", async () => {
    const database = testDatabase();
    const app = createApp(database, config);

    const response = await request(app).get("/api/health").expect(200);

    expect(database.check).toHaveBeenCalledOnce();
    expect(response.body).toMatchObject({
      status: "ok",
      service: "api",
      database: "connected",
    });
    expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
  });

  it("reports an unavailable database without leaking implementation details", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = createApp(
      testDatabase({
        check: vi.fn().mockRejectedValue(new Error("connection refused")),
      }),
      config,
    );

    const response = await request(app).get("/api/health").expect(503);

    expect(apiErrorResponseSchema.parse(response.body)).toEqual({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Database is unavailable.",
      },
    });
    expect(logError).toHaveBeenCalledWith("Health check failed", expect.any(Error));
  });
});

describe("authentication", () => {
  it("logs a reader in with a safe session response and HTTP-only cookie", async () => {
    const database = testDatabase();
    const app = createApp(database, config);

    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", config.corsOrigin)
      .send({
        email: "  READER@amazon2.local ",
        password: "ReaderDemo123!",
      })
      .expect(200);

    expect(sessionResponseSchema.parse(response.body)).toEqual({
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "reader@amazon2.local",
        displayName: "Riley Reader",
        role: "READER",
      },
    });
    expect(response.body.user).not.toHaveProperty("passwordHash");
    expect(response.body).not.toHaveProperty("token");
    expect(response.headers["access-control-allow-origin"]).toBe(config.corsOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["cache-control"]).toBe("no-store");

    const cookies = response.headers["set-cookie"];

    expect(cookies).toBeDefined();
    expect(cookies?.[0]).toContain("amazon2_session=");
    expect(cookies?.[0]).toContain("Max-Age=900");
    expect(cookies?.[0]).toContain("Path=/api");
    expect(cookies?.[0]).toContain("HttpOnly");
    expect(cookies?.[0]).toContain("SameSite=Lax");
    expect(cookies?.[0]).not.toContain("Secure");
    expect(database.findUserByEmail).toHaveBeenCalledWith("reader@amazon2.local");
  });

  it.each([
    ["an unknown email", "missing@amazon2.local", "ReaderDemo123!"],
    ["a wrong password", "reader@amazon2.local", "not-the-password"],
  ])("rejects %s with the same generic response", async (_case, email, password) => {
    const app = createApp(testDatabase(), config);

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email, password })
      .expect(401);

    expect(apiErrorResponseSchema.parse(response.body)).toEqual({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect.",
      },
    });
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects invalid input and never accepts a client-selected role", async () => {
    const database = testDatabase();
    const app = createApp(database, config);

    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: "reader@amazon2.local",
        password: "ReaderDemo123!",
        role: "LIBRARIAN",
      })
      .expect(400);

    expect(apiErrorResponseSchema.parse(response.body)).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Login details are invalid.",
      },
    });
    expect(database.findUserByEmail).not.toHaveBeenCalled();
  });

  it("returns the current reader session from the cookie", async () => {
    const database = testDatabase();
    const app = createApp(database, config);
    const agent = request.agent(app);

    await agent.post("/api/auth/login").send({
      email: "reader@amazon2.local",
      password: "ReaderDemo123!",
    });
    const response = await agent.get("/api/auth/me").expect(200);

    expect(sessionResponseSchema.parse(response.body).user.role).toBe("READER");
    expect(database.findUserById).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("identifies a librarian from the server-side user record", async () => {
    const app = createApp(testDatabase(), config);
    const agent = request.agent(app);

    await agent.post("/api/auth/login").send({
      email: "librarian@amazon2.local",
      password: "LibrarianDemo123!",
    });
    const response = await agent.get("/api/auth/me").expect(200);

    expect(sessionResponseSchema.parse(response.body)).toMatchObject({
      user: {
        email: "librarian@amazon2.local",
        role: "LIBRARIAN",
      },
    });
  });

  it("rejects current-session access without a valid cookie", async () => {
    const app = createApp(testDatabase(), config);
    const response = await request(app).get("/api/auth/me").expect(401);

    expect(apiErrorResponseSchema.parse(response.body)).toEqual({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication is required.",
      },
    });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("logs out by expiring the cookie and invalidating the agent session", async () => {
    const app = createApp(testDatabase(), config);
    const agent = request.agent(app);

    await agent.post("/api/auth/login").send({
      email: "reader@amazon2.local",
      password: "ReaderDemo123!",
    });
    const logout = await agent.post("/api/auth/logout").expect(204);

    expect(logout.headers["set-cookie"]?.[0]).toContain("amazon2_session=");
    expect(logout.headers["set-cookie"]?.[0]).toContain("Expires=Thu, 01 Jan 1970");
    expect(logout.text).toBe("");
    await agent.get("/api/auth/me").expect(401);
  });

  it("rejects credentialed requests from an unconfigured browser origin", async () => {
    const app = createApp(testDatabase(), config);
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://attacker.example")
      .send({
        email: "reader@amazon2.local",
        password: "ReaderDemo123!",
      })
      .expect(403);

    expect(apiErrorResponseSchema.parse(response.body).error.code).toBe("FORBIDDEN");
  });
});

describe("central route handling", () => {
  it("returns the shared not-found response for an unknown route", async () => {
    const response = await request(createApp(testDatabase(), config))
      .get("/api/unknown")
      .expect(404);

    expect(apiErrorResponseSchema.parse(response.body)).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Route not found.",
      },
    });
  });
});
