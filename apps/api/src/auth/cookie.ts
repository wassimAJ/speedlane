import type { CookieOptions, Response } from "express";

export const SESSION_COOKIE_NAME = "amazon2_session";

export interface SessionCookieConfig {
  secure: boolean;
  ttlSeconds: number;
}

function baseCookieOptions(config: SessionCookieConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.secure,
    path: "/api",
  };
}

export function setSessionCookie(
  response: Response,
  token: string,
  config: SessionCookieConfig,
) {
  response.cookie(SESSION_COOKIE_NAME, token, {
    ...baseCookieOptions(config),
    maxAge: config.ttlSeconds * 1_000,
  });
}

export function clearSessionCookie(response: Response, config: SessionCookieConfig) {
  response.clearCookie(SESSION_COOKIE_NAME, baseCookieOptions(config));
}

export function readSessionCookie(cookieHeader: string | undefined) {
  if (cookieHeader === undefined) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const name = cookie.slice(0, separatorIndex).trim();

    if (name !== SESSION_COOKIE_NAME) {
      continue;
    }

    const value = cookie.slice(separatorIndex + 1).trim();

    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  return null;
}
