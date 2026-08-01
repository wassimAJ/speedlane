import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";

import {
  PENDING_VERIFICATION_COOKIE_NAME,
  clearPendingVerificationCookie,
  readPendingVerificationCookie,
  setPendingVerificationCookie,
} from "./pending-cookie.js";

function responseDouble() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response;
}

describe("pending verification cookie", () => {
  it("sets a scoped HTTP-only cookie for the full pending-registration lifetime", () => {
    const response = responseDouble();
    const token = "a".repeat(43);

    setPendingVerificationCookie(response, token, {
      secure: true,
      ttlSeconds: 60,
    });

    expect(response.cookie).toHaveBeenCalledWith(
      PENDING_VERIFICATION_COOKIE_NAME,
      token,
      {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/api/auth",
        maxAge: 86_400_000,
      },
    );
  });

  it("clears the cookie with the same security scope", () => {
    const response = responseDouble();

    clearPendingVerificationCookie(response, {
      secure: false,
      ttlSeconds: 900,
    });

    expect(response.clearCookie).toHaveBeenCalledWith(
      PENDING_VERIFICATION_COOKIE_NAME,
      {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/api/auth",
      },
    );
  });

  it("reads only the exact fixed-length base64url token", () => {
    const token = "A_b-0".repeat(8) + "Abc";

    expect(
      readPendingVerificationCookie(
        `other=value; ${PENDING_VERIFICATION_COOKIE_NAME}=${token}`,
      ),
    ).toBe(token);
    expect(
      readPendingVerificationCookie(
        `${PENDING_VERIFICATION_COOKIE_NAME}=${"a".repeat(42)}`,
      ),
    ).toBeNull();
    expect(
      readPendingVerificationCookie(
        `${PENDING_VERIFICATION_COOKIE_NAME}=${"a".repeat(42)}%25`,
      ),
    ).toBeNull();
    expect(readPendingVerificationCookie(undefined)).toBeNull();
  });
});
