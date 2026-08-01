import "dotenv/config";
import { z } from "zod";

const environmentBooleanSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const optionalEnvironmentStringSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

function isValidResendSender(value: string) {
  if (z.string().email().safeParse(value).success) {
    return true;
  }

  const namedSender = /^([^<>\r\n]{1,120})\s<([^<>\s]+)>$/.exec(value);
  return (
    namedSender !== null &&
    (namedSender[1]?.trim().length ?? 0) > 0 &&
    z.string().email().safeParse(namedSender[2]).success
  );
}

const optionalResendSenderSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .max(320)
    .refine(
      isValidResendSender,
      "RESEND_FROM_EMAIL must be an email address or Display Name <email>.",
    )
    .optional(),
);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().max(65_535).default(3000),
    DATABASE_URL: z.string().url(),
    CORS_ORIGIN: z
      .string()
      .url()
      .default("http://localhost:5173")
      .transform((value) => new URL(value).origin),
    JWT_SECRET: z
      .string()
      .min(32, "JWT_SECRET must contain at least 32 characters.")
      .refine(
        (value) => value !== "replace_with_a_long_random_value",
        "JWT_SECRET must be replaced with a random value.",
      ),
    JWT_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
    COOKIE_SECURE: environmentBooleanSchema.optional(),
    RESEND_API_KEY: optionalEnvironmentStringSchema,
    RESEND_FROM_EMAIL: optionalResendSenderSchema,
  })
  .superRefine((environment, context) => {
    if (
      (environment.RESEND_API_KEY === undefined) !==
      (environment.RESEND_FROM_EMAIL === undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "RESEND_API_KEY and RESEND_FROM_EMAIL must either both be set or both be omitted.",
        path: ["RESEND_API_KEY"],
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function readEnvironment(environment: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse(environment);
}
