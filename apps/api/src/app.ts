import {
  authenticatedUserSchema,
  healthResponseSchema,
  loginInputSchema,
  sessionResponseSchema,
  type AuthenticatedUser,
} from "@amazon-2/contracts";
import express from "express";

import {
  clearSessionCookie,
  setSessionCookie,
  type SessionCookieConfig,
} from "./auth/cookie.js";
import {
  createAuthenticationMiddleware,
  requireAuthenticatedUser,
  type AuthenticationStore,
} from "./auth/middleware.js";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "./auth/password.js";
import { createSessionToken, type TokenConfig } from "./auth/token.js";
import { createCorsMiddleware } from "./http/cors.js";
import { errorHandler, HttpError, notFoundHandler } from "./http/errors.js";

export interface DatabaseHealthcheck {
  check(): Promise<void>;
}

export interface AuthUserRecord extends AuthenticatedUser {
  passwordHash: string;
}

export interface AppDatabase extends DatabaseHealthcheck, AuthenticationStore {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
}

export interface AppConfig {
  corsOrigin: string;
  jwtSecret: string;
  sessionTtlSeconds: number;
  secureCookie: boolean;
}

function safeUser(user: AuthUserRecord): AuthenticatedUser {
  return authenticatedUserSchema.parse({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  });
}

export function createApp(database: AppDatabase, config: AppConfig) {
  const app = express();
  const tokenConfig: TokenConfig = {
    secret: config.jwtSecret,
    ttlSeconds: config.sessionTtlSeconds,
  };
  const cookieConfig: SessionCookieConfig = {
    secure: config.secureCookie,
    ttlSeconds: config.sessionTtlSeconds,
  };
  const authenticate = createAuthenticationMiddleware(database, tokenConfig);

  app.disable("x-powered-by");
  app.use(createCorsMiddleware(config.corsOrigin));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", async (_request, response, next) => {
    try {
      await database.check();
      const body = healthResponseSchema.parse({
        status: "ok",
        service: "api",
        database: "connected",
        timestamp: new Date().toISOString(),
      });

      response.status(200).json(body);
    } catch (error: unknown) {
      next(new HttpError(503, "SERVICE_UNAVAILABLE", "Database is unavailable."));
      console.error("Health check failed", error);
    }
  });

  app.use("/api/auth", (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  app.post("/api/auth/login", async (request, response, next) => {
    const input = loginInputSchema.safeParse(request.body);

    if (!input.success) {
      next(new HttpError(400, "INVALID_REQUEST", "Login details are invalid."));
      return;
    }

    try {
      const user = await database.findUserByEmail(input.data.email);
      const passwordMatches = await verifyPassword(
        input.data.password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      );

      if (user === null || !passwordMatches) {
        next(
          new HttpError(
            401,
            "INVALID_CREDENTIALS",
            "Email or password is incorrect.",
          ),
        );
        return;
      }

      const authenticatedUser = safeUser(user);
      const token = createSessionToken(authenticatedUser.id, tokenConfig);

      setSessionCookie(response, token, cookieConfig);
      response.status(200).json(
        sessionResponseSchema.parse({
          user: authenticatedUser,
        }),
      );
    } catch (error: unknown) {
      next(error);
    }
  });

  app.post("/api/auth/logout", (_request, response) => {
    clearSessionCookie(response, cookieConfig);
    response.status(204).send();
  });

  app.get("/api/auth/me", authenticate, (request, response) => {
    response.status(200).json(
      sessionResponseSchema.parse({
        user: requireAuthenticatedUser(request),
      }),
    );
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
