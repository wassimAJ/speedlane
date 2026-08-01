import type { AuthenticatedUser, Role } from "@amazon-2/contracts";
import type { Request, RequestHandler } from "express";

import { HttpError } from "../http/errors.js";
import { readSessionCookie } from "./cookie.js";
import { verifySessionToken, type TokenConfig } from "./token.js";

export interface AuthenticationStore {
  findUserById(id: string): Promise<AuthenticatedUser | null>;
}

export function createAuthenticationMiddleware(
  store: AuthenticationStore,
  tokenConfig: TokenConfig,
): RequestHandler {
  return async (request, _response, next) => {
    const token = readSessionCookie(request.get("cookie"));
    const userId = token === null ? null : verifySessionToken(token, tokenConfig);

    if (userId === null) {
      next(new HttpError(401, "UNAUTHENTICATED", "Authentication is required."));
      return;
    }

    try {
      const user = await store.findUserById(userId);

      if (user === null) {
        next(new HttpError(401, "UNAUTHENTICATED", "Authentication is required."));
        return;
      }

      request.authenticatedUser = user;
      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}

export function requireAuthenticatedUser(request: Request): AuthenticatedUser {
  if (request.authenticatedUser === undefined) {
    throw new HttpError(401, "UNAUTHENTICATED", "Authentication is required.");
  }

  return request.authenticatedUser;
}

export function requireRoles(...allowedRoles: readonly Role[]): RequestHandler {
  return (request, _response, next) => {
    const user = request.authenticatedUser;

    if (user === undefined) {
      next(new HttpError(401, "UNAUTHENTICATED", "Authentication is required."));
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      next(new HttpError(403, "FORBIDDEN", "You do not have permission to do that."));
      return;
    }

    next();
  };
}
