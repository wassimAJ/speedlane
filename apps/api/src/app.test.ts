import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createApp } from "./app.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("returns a shared, database-backed health response", async () => {
    const check = vi.fn().mockResolvedValue(undefined);
    const app = createApp({ check });

    const response = await request(app).get("/api/health").expect(200);

    expect(check).toHaveBeenCalledOnce();
    expect(response.body).toMatchObject({
      status: "ok",
      service: "api",
      database: "connected",
    });
    expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
  });

  it("reports an unavailable database without leaking implementation details", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = createApp({
      check: vi.fn().mockRejectedValue(new Error("connection refused")),
    });

    await request(app)
      .get("/api/health")
      .expect(503)
      .expect({ error: "Database is unavailable." });

    expect(logError).toHaveBeenCalledWith("Health check failed", expect.any(Error));
  });
});
