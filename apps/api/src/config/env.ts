import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65_535).default(3000),
  DATABASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
});

export type Environment = z.infer<typeof environmentSchema>;

export function readEnvironment(environment: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse(environment);
}
