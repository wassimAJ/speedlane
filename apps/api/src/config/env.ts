import "dotenv/config";
import { z } from "zod";

const environmentBooleanSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const environmentSchema = z.object({
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
});

export type Environment = z.infer<typeof environmentSchema>;

export function readEnvironment(environment: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse(environment);
}
