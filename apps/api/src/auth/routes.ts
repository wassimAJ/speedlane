import {
  authenticatedUserSchema,
  loginInputSchema,
  sessionResponseSchema,
  type AuthenticatedUser,
} from "@amazon-2/contracts";
import { Router } from "express";

import { HttpError } from "../http/errors.js";
import {
  clearSessionCookie,
  setSessionCookie,
  type SessionCookieConfig,
} from "./cookie.js";
import {
  createAuthenticationMiddleware,
  requireAuthenticatedUser,
  type AuthenticationStore,
} from "./middleware.js";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "./password.js";
import { createSessionToken, type TokenConfig } from "./token.js";

export interface AuthUserRecord extends AuthenticatedUser {
  passwordHash: string;
}

export interface AuthStore extends AuthenticationStore {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
}

export interface AuthRouterConfig {
  cookie: SessionCookieConfig;
  token: TokenConfig;
}

function safeUser(user: AuthUserRecord): AuthenticatedUser {
  return authenticatedUserSchema.parse({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  });
}

export function createAuthRouter(store: AuthStore, config: AuthRouterConfig) {
  const router = Router();
  const authenticate = createAuthenticationMiddleware(store, config.token);

  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  router.post("/login", async (request, response, next) => {
    const input = loginInputSchema.safeParse(request.body);

    if (!input.success) {
      next(new HttpError(400, "INVALID_REQUEST", "Login details are invalid."));
      return;
    }

    try {
      const user = await store.findUserByEmail(input.data.email);
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
      const token = createSessionToken(authenticatedUser.id, config.token);

      setSessionCookie(response, token, config.cookie);
      response.status(200).json(
        sessionResponseSchema.parse({
          user: authenticatedUser,
        }),
      );
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/logout", (_request, response) => {
    clearSessionCookie(response, config.cookie);
    response.status(204).send();
  });

  router.get("/me", authenticate, (request, response) => {
    response.status(200).json(
      sessionResponseSchema.parse({
        user: requireAuthenticatedUser(request),
      }),
    );
  });

  return router;
}
