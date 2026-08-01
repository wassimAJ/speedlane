import type { Role } from "@amazon-2/contracts";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { errorHandler } from "../http/errors.js";
import { SESSION_COOKIE_NAME } from "./cookie.js";
import { createAuthenticationMiddleware, requireRoles } from "./middleware.js";
import { createSessionToken, type TokenConfig } from "./token.js";

const userId = "00000000-0000-4000-8000-000000000001";
const tokenConfig: TokenConfig = {
  secret: "test-only-secret-with-more-than-thirty-two-characters",
  ttlSeconds: 900,
};

function roleProtectedApp(role: Role) {
  const app = express();
  const authenticate = createAuthenticationMiddleware(
    {
      async findUserById() {
        return {
          id: userId,
          email: "person@amazon2.local",
          displayName: "Test Person",
          role,
        };
      },
    },
    tokenConfig,
  );

  app.get(
    "/librarian-only",
    authenticate,
    requireRoles("LIBRARIAN"),
    (_request, response) => response.sendStatus(204),
  );
  app.use(errorHandler);

  return app;
}

describe("role middleware", () => {
  it("rejects a reader at the server boundary", async () => {
    const token = createSessionToken(userId, tokenConfig);
    const response = await request(roleProtectedApp("READER"))
      .get("/librarian-only")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${token}`)
      .expect(403);

    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("allows a librarian based on the server-side role", async () => {
    const token = createSessionToken(userId, tokenConfig);

    await request(roleProtectedApp("LIBRARIAN"))
      .get("/librarian-only")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${token}`)
      .expect(204);
  });
});
