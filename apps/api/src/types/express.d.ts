import type { AuthenticatedUser } from "@amazon-2/contracts";

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: AuthenticatedUser;
    }
  }
}

export {};
