import {
  profileResponseSchema,
  registerResponseSchema,
  resendVerificationCodeResponseSchema,
  verifyEmailResponseSchema,
  type RegisterInput,
  type UpdateProfileInput,
  type VerifyEmailInput,
} from "@amazon-2/contracts";

import { requestJson } from "../api";

const JSON_HEADERS = { "Content-Type": "application/json" };

export function registerReader(input: RegisterInput) {
  return requestJson("/api/auth/register", registerResponseSchema, {
    body: JSON.stringify(input),
    headers: JSON_HEADERS,
    method: "POST",
  });
}

export function verifyEmail(input: VerifyEmailInput) {
  return requestJson("/api/auth/verify-email", verifyEmailResponseSchema, {
    body: JSON.stringify(input),
    headers: JSON_HEADERS,
    method: "POST",
  });
}

export function resendVerificationCode(email: string) {
  return requestJson(
    "/api/auth/resend-verification",
    resendVerificationCodeResponseSchema,
    {
      body: JSON.stringify({ email }),
      headers: JSON_HEADERS,
      method: "POST",
    },
  );
}

export function getProfile(signal?: AbortSignal) {
  return requestJson("/api/me/profile", profileResponseSchema, { signal });
}

export function updateProfile(input: UpdateProfileInput) {
  return requestJson("/api/me/profile", profileResponseSchema, {
    body: JSON.stringify(input),
    headers: JSON_HEADERS,
    method: "PUT",
  });
}
