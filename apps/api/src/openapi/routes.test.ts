import { describe, expect, it } from "vitest";
import request from "supertest";

import { createApp, type AppConfig, type AppDatabase } from "../app.js";

const config: AppConfig = {
  corsOrigin: "http://localhost:5173",
  jwtSecret: "test-only-secret-with-more-than-thirty-two-characters",
  sessionTtlSeconds: 900,
  secureCookie: false,
};

const approvedOperations = {
  "/api/health": ["get"],
  "/api/auth/login": ["post"],
  "/api/auth/register": ["post"],
  "/api/auth/verify-email": ["post"],
  "/api/auth/resend-verification": ["post"],
  "/api/auth/logout": ["post"],
  "/api/auth/me": ["get"],
  "/api/discover": ["get"],
  "/api/books": ["get"],
  "/api/books/{bookId}": ["get"],
  "/api/genres": ["get"],
  "/api/me/favourite-genres": ["get", "put"],
  "/api/me/profile": ["get", "put"],
  "/api/me/for-your-shelves": ["get"],
  "/api/me/reading-list": ["get"],
  "/api/me/reading-list/{bookId}": ["delete", "put"],
  "/api/admin/books": ["get", "post"],
  "/api/admin/books/{bookId}": ["delete", "put"],
  "/api/admin/books/{bookId}/restore": ["post"],
  "/api/admin/genres": ["get", "post"],
  "/api/admin/genres/{genreId}": ["delete", "put"],
  "/api/admin/genres/{genreId}/restore": ["post"],
} as const;

const publicOperations = new Set([
  "get /api/health",
  "post /api/auth/login",
  "post /api/auth/register",
  "post /api/auth/resend-verification",
  "post /api/auth/logout",
  "get /api/discover",
]);
const pendingVerificationOperations = new Set([
  "post /api/auth/verify-email",
]);

function documentationApp() {
  return createApp({} as AppDatabase, config);
}

function collectReferences(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectReferences);
  }

  if (value === null || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  return [
    ...(typeof record.$ref === "string" ? [record.$ref] : []),
    ...Object.values(record).flatMap(collectReferences),
  ];
}

describe("OpenAPI documentation", () => {
  it("serves a public OpenAPI 3 document with every approved operation", async () => {
    const response = await request(documentationApp())
      .get("/api/openapi.json")
      .expect(200);

    expect(response.body.openapi).toBe("3.0.3");
    expect(response.body.info).toMatchObject({
      title: "Amazon 2.0 API",
      version: "1.0.0",
    });
    expect(Object.keys(response.body.paths).sort()).toEqual(
      Object.keys(approvedOperations).sort(),
    );

    for (const [path, methods] of Object.entries(approvedOperations)) {
      const documentedMethods = Object.keys(response.body.paths[path]).filter(
        (key) =>
          ["get", "post", "put", "patch", "delete", "head", "options"].includes(
            key,
          ),
      );

      expect(documentedMethods.sort()).toEqual([...methods].sort());
    }

    for (const reference of collectReferences(response.body)) {
      expect(reference).toMatch(/^#\/components\/schemas\/[A-Za-z0-9]+$/);
      expect(response.body.components.schemas).toHaveProperty(
        reference.replace("#/components/schemas/", ""),
      );
    }
  });

  it("documents cookie authentication only on protected operations", async () => {
    const response = await request(documentationApp())
      .get("/api/openapi.json")
      .expect(200);

    expect(response.body.components.securitySchemes.cookieAuth).toEqual({
      type: "apiKey",
      in: "cookie",
      name: "amazon2_session",
      description: expect.stringContaining("HTTP-only"),
    });
    expect(
      response.body.components.securitySchemes.pendingVerificationCookie,
    ).toEqual({
      type: "apiKey",
      in: "cookie",
      name: "amazon2_pending_verification",
      description: expect.stringContaining("not an authenticated session"),
    });

    for (const [path, methods] of Object.entries(approvedOperations)) {
      for (const method of methods) {
        const operation = response.body.paths[path][method];
        const operationKey = `${method} ${path}`;

        expect(operation.security).toEqual(
          publicOperations.has(operationKey)
            ? []
            : pendingVerificationOperations.has(operationKey)
              ? [{ pendingVerificationCookie: [] }]
              : [{ cookieAuth: [] }],
        );
      }
    }
  });

  it("uses safe contract-derived schemas without leaking secrets", async () => {
    const response = await request(documentationApp())
      .get("/api/openapi.json")
      .expect(200);
    const schemas = response.body.components.schemas;

    expect(schemas.LoginInput.properties.password).toMatchObject({
      type: "string",
      format: "password",
      writeOnly: true,
    });
    expect(schemas.LoginInput.properties.password).not.toHaveProperty("example");
    expect(schemas.RegisterInput.properties.password).toMatchObject({
      type: "string",
      format: "password",
      writeOnly: true,
    });
    expect(schemas.ProfileResponse.properties.profile).toBeDefined();
    expect(schemas.DiscoveryResponse.properties.books.maxItems).toBe(6);
    expect(
      Object.keys(
        schemas.DiscoveryResponse.properties.books.items.properties,
      ).sort(),
    ).toEqual(["author", "coverSeed", "genres", "title"]);
    expect(schemas.AdminError.properties).toEqual({
      error: {
        type: "string",
        minLength: 1,
      },
    });

    const serializedDocument = JSON.stringify(response.body).toLowerCase();
    for (const forbiddenValue of [
      "passwordhash",
      "password_hash",
      "jwtsecret",
      "jwt_secret",
      "readerdemo123",
      "librariandemo123",
      "scrypt$",
      "pendingtoken",
      "pending_token",
    ]) {
      expect(serializedDocument).not.toContain(forbiddenValue);
    }
  });

  it("documents pending-registration cookies and best-effort delivery without exposing values", async () => {
    const response = await request(documentationApp())
      .get("/api/openapi.json")
      .expect(200);
    const register = response.body.paths["/api/auth/register"].post;
    const verify = response.body.paths["/api/auth/verify-email"].post;
    const resend = response.body.paths["/api/auth/resend-verification"].post;

    expect(register.description).toContain("up to 24 hours");
    expect(register.description).toContain("best-effort background task");
    expect(register.responses["202"].headers["Set-Cookie"]).toBeDefined();
    expect(verify.description).toContain("opaque pending-verification cookie");
    expect(verify.description).toContain("atomically commits");
    expect(resend.description).toContain("60-second cooldown");
    expect(resend.description).toContain("without extending the 24-hour");
    expect(resend.responses["202"].headers["Set-Cookie"]).toBeDefined();
  });

  it("documents structured payload-too-large responses for non-admin JSON bodies", async () => {
    const response = await request(documentationApp())
      .get("/api/openapi.json")
      .expect(200);
    const operations = [
      response.body.paths["/api/auth/login"].post,
      response.body.paths["/api/auth/register"].post,
      response.body.paths["/api/auth/verify-email"].post,
      response.body.paths["/api/auth/resend-verification"].post,
      response.body.paths["/api/me/profile"].put,
      response.body.paths["/api/me/favourite-genres"].put,
      response.body.paths["/api/me/reading-list/{bookId}"].put,
    ];

    for (const operation of operations) {
      expect(operation.responses["413"]).toEqual({
        description: "Request body is too large.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
          },
        },
      });
    }

    expect(
      response.body.paths["/api/admin/books"].post.responses["413"].content[
        "application/json"
      ].schema,
    ).toEqual({ $ref: "#/components/schemas/AdminError" });
  });

  it("documents personalised ordering and reading-list upsert semantics", async () => {
    const response = await request(documentationApp())
      .get("/api/openapi.json")
      .expect(200);
    const shelvesDescription =
      response.body.paths["/api/me/for-your-shelves"].get.description;
    const readingListDescription =
      response.body.paths["/api/me/reading-list/{bookId}"].put.description;

    expect(shelvesDescription).toContain(
      "favourite-genre preference order, then newest, then book ID",
    );
    expect(shelvesDescription).toContain(
      "visible reading list are excluded",
    );
    expect(readingListDescription).toContain(
      "missing entry is created as WANT_TO_READ",
    );
    expect(readingListDescription).toContain(
      "soft-removed entry is restored with its previously saved state",
    );
    expect(readingListDescription).toContain("one entry per user/book");
    expect(readingListDescription).toContain(
      "Archived books cannot be added or updated and return 404",
    );
  });

  it("serves Swagger UI at the documented public URL", async () => {
    const redirect = await request(documentationApp()).get("/api/docs");
    const uiPath = redirect.status === 301 ? redirect.headers.location : "/api/docs";

    if (redirect.status === 301) {
      expect(redirect.headers.location).toBe("/api/docs/");
    } else {
      expect(redirect.status).toBe(200);
    }

    const response =
      redirect.status === 200
        ? redirect
        : await request(documentationApp()).get(uiPath).expect(200);

    expect(response.type).toMatch(/^text\/html/);
    expect(response.text).toContain('id="swagger-ui"');
    expect(response.text).toContain("Amazon 2.0 API documentation");
  });
});
