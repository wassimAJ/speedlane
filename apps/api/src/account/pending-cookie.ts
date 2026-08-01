import { PENDING_REGISTRATION_EXPIRES_IN_SECONDS } from "@amazon-2/contracts";
import type { CookieOptions, Response } from "express";

import type { SessionCookieConfig } from "../auth/cookie.js";

export const PENDING_VERIFICATION_COOKIE_NAME =
  "amazon2_pending_verification";

function pendingCookieOptions(
  config: SessionCookieConfig,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.secure,
    path: "/api/auth",
  };
}

export function setPendingVerificationCookie(
  response: Response,
  pendingToken: string,
  config: SessionCookieConfig,
) {
  response.cookie(PENDING_VERIFICATION_COOKIE_NAME, pendingToken, {
    ...pendingCookieOptions(config),
    maxAge: PENDING_REGISTRATION_EXPIRES_IN_SECONDS * 1_000,
  });
}

export function clearPendingVerificationCookie(
  response: Response,
  config: SessionCookieConfig,
) {
  response.clearCookie(
    PENDING_VERIFICATION_COOKIE_NAME,
    pendingCookieOptions(config),
  );
}

export function readPendingVerificationCookie(
  cookieHeader: string | undefined,
) {
  if (cookieHeader === undefined) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const name = cookie.slice(0, separatorIndex).trim();
    if (name !== PENDING_VERIFICATION_COOKIE_NAME) {
      continue;
    }

    try {
      const value = decodeURIComponent(
        cookie.slice(separatorIndex + 1).trim(),
      );
      return /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : null;
    } catch {
      return null;
    }
  }

  return null;
}
