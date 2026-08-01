import { z } from "zod";

import { roleSchema, sessionResponseSchema } from "./auth.js";

export const EMAIL_VERIFICATION_CODE_LENGTH = 6;
export const EMAIL_VERIFICATION_EXPIRES_IN_SECONDS = 10 * 60;
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;
export const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;
export const PENDING_REGISTRATION_EXPIRES_IN_SECONDS = 24 * 60 * 60;

export const REGISTER_RATE_LIMIT_MAX_REQUESTS = 5;
export const VERIFY_RATE_LIMIT_MAX_REQUESTS = 10;
export const RESEND_RATE_LIMIT_MAX_REQUESTS = 5;
export const AUTH_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

export const accountEmailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform((email) => email.toLowerCase());

export const displayNameSchema = z.string().trim().min(1).max(120);

export const registrationPasswordSchema = z
  .string()
  .min(12)
  .max(128)
  .superRefine((password, context) => {
    const requirements = [
      { pattern: /[a-z]/, message: "Password must include a lowercase letter." },
      { pattern: /[A-Z]/, message: "Password must include an uppercase letter." },
      { pattern: /\d/, message: "Password must include a number." },
    ];

    for (const requirement of requirements) {
      if (!requirement.pattern.test(password)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: requirement.message,
        });
      }
    }
  });

export const registerInputSchema = z
  .object({
    displayName: displayNameSchema,
    email: accountEmailSchema,
    password: registrationPasswordSchema,
  })
  .strict();

export const verificationCodeSchema = z
  .string()
  .length(EMAIL_VERIFICATION_CODE_LENGTH)
  .regex(/^\d+$/, "Verification code must contain numbers only.");

export const verifyEmailInputSchema = z
  .object({
    email: accountEmailSchema,
    code: verificationCodeSchema,
  })
  .strict();

export const resendVerificationCodeInputSchema = z
  .object({
    email: accountEmailSchema,
  })
  .strict();

export const verificationDispatchResponseSchema = z
  .object({
    verification: z
      .object({
        email: accountEmailSchema,
        codeLength: z.literal(EMAIL_VERIFICATION_CODE_LENGTH),
        expiresInSeconds: z.literal(EMAIL_VERIFICATION_EXPIRES_IN_SECONDS),
        resendCooldownSeconds: z.literal(
          EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
        ),
      })
      .strict(),
  })
  .strict();

export const registerResponseSchema = verificationDispatchResponseSchema;
export const resendVerificationCodeResponseSchema =
  verificationDispatchResponseSchema;
export const verifyEmailResponseSchema = sessionResponseSchema;

export const profileSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email().max(320),
    displayName: displayNameSchema,
    role: roleSchema,
    emailVerifiedAt: z.string().datetime({ offset: true }),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const profileResponseSchema = z
  .object({
    profile: profileSchema,
  })
  .strict();

export const updateProfileInputSchema = z
  .object({
    displayName: displayNameSchema,
  })
  .strict();

export const accountRulesSchema = z
  .object({
    registrationRole: z.literal("READER_ONLY"),
    privilegedRegistrationFields: z.literal("REJECTED"),
    authenticationBeforeVerification: z.literal("DENIED"),
    verificationCode: z.literal("HASHED_NUMERIC_SINGLE_USE"),
    verificationCodeLength: z.literal(EMAIL_VERIFICATION_CODE_LENGTH),
    verificationExpiresInSeconds: z.literal(
      EMAIL_VERIFICATION_EXPIRES_IN_SECONDS,
    ),
    verificationMaximumAttempts: z.literal(EMAIL_VERIFICATION_MAX_ATTEMPTS),
    pendingRegistrationExpiresInSeconds: z.literal(
      PENDING_REGISTRATION_EXPIRES_IN_SECONDS,
    ),
    resendCooldownSeconds: z.literal(
      EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    ),
    profileAuthorization: z.literal("AUTHENTICATED"),
    profileRole: z.literal("READ_ONLY"),
  })
  .strict();

export const ACCOUNT_RULES = accountRulesSchema.parse({
  registrationRole: "READER_ONLY",
  privilegedRegistrationFields: "REJECTED",
  authenticationBeforeVerification: "DENIED",
  verificationCode: "HASHED_NUMERIC_SINGLE_USE",
  verificationCodeLength: EMAIL_VERIFICATION_CODE_LENGTH,
  verificationExpiresInSeconds: EMAIL_VERIFICATION_EXPIRES_IN_SECONDS,
  verificationMaximumAttempts: EMAIL_VERIFICATION_MAX_ATTEMPTS,
  pendingRegistrationExpiresInSeconds:
    PENDING_REGISTRATION_EXPIRES_IN_SECONDS,
  resendCooldownSeconds: EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
  profileAuthorization: "AUTHENTICATED",
  profileRole: "READ_ONLY",
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
export type RegisterResponse = z.infer<typeof registerResponseSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailInputSchema>;
export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;
export type ResendVerificationCodeInput = z.infer<
  typeof resendVerificationCodeInputSchema
>;
export type ResendVerificationCodeResponse = z.infer<
  typeof resendVerificationCodeResponseSchema
>;
export type VerificationDispatchResponse = z.infer<
  typeof verificationDispatchResponseSchema
>;
export type Profile = z.infer<typeof profileSchema>;
export type ProfileResponse = z.infer<typeof profileResponseSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
export type AccountRules = z.infer<typeof accountRulesSchema>;
