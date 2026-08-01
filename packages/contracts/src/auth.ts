import { z } from "zod";

export const roleSchema = z.enum(["READER", "LIBRARIAN"]);

export const authenticatedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().max(320),
  displayName: z.string().min(1).max(120),
  role: roleSchema,
});

export const sessionResponseSchema = z.object({
  user: authenticatedUserSchema,
});

export const loginInputSchema = z
  .object({
    email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
    password: z.string().min(1).max(256),
  })
  .strict();

export type Role = z.infer<typeof roleSchema>;
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
