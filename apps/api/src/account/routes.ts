import {
  REGISTER_RATE_LIMIT_MAX_REQUESTS,
  RESEND_RATE_LIMIT_MAX_REQUESTS,
  VERIFY_RATE_LIMIT_MAX_REQUESTS,
  EMAIL_VERIFICATION_CODE_LENGTH,
  EMAIL_VERIFICATION_EXPIRES_IN_SECONDS,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
  profileResponseSchema,
  registerInputSchema,
  registerResponseSchema,
  resendVerificationCodeInputSchema,
  resendVerificationCodeResponseSchema,
  updateProfileInputSchema,
  verifyEmailInputSchema,
  verifyEmailResponseSchema,
  type Profile,
} from "@amazon-2/contracts";
import { Router, type NextFunction, type Request, type Response } from "express";

import {
  createAuthenticationMiddleware,
  requireAuthenticatedUser,
  type AuthenticationStore,
} from "../auth/middleware.js";
import { hashPassword } from "../auth/password.js";
import {
  setSessionCookie,
  type SessionCookieConfig,
} from "../auth/cookie.js";
import { createSessionToken, type TokenConfig } from "../auth/token.js";
import { HttpError } from "../http/errors.js";
import type {
  EmailVerificationResult,
  ReaderRegistrationRecord,
  VerificationDispatchPreparation,
} from "./database.js";
import {
  UnavailableVerificationMailDelivery,
  type VerificationMailDelivery,
} from "./mail.js";
import { AccountRateLimiter } from "./rate-limit.js";
import {
  clearPendingVerificationCookie,
  readPendingVerificationCookie,
  setPendingVerificationCookie,
} from "./pending-cookie.js";
import {
  createVerificationChallengeDraft,
  type VerificationChallengeDraft,
} from "./verification-code.js";

export interface AccountStore extends AuthenticationStore {
  prepareReaderRegistration(
    registration: ReaderRegistrationRecord,
    draft: VerificationChallengeDraft,
    now: Date,
  ): Promise<VerificationDispatchPreparation>;
  prepareVerificationResend(
    email: string,
    draft: VerificationChallengeDraft,
    currentPendingToken: string | null,
    now: Date,
  ): Promise<VerificationDispatchPreparation>;
  markVerificationChallengeDispatched(
    challengeId: string,
    dispatchedAt: Date,
  ): Promise<void>;
  invalidateVerificationChallenge(
    challengeId: string,
    invalidatedAt: Date,
  ): Promise<void>;
  markVerificationChallengeDeliveryFailed(
    challengeId: string,
    deliveryFailedAt: Date,
  ): Promise<void>;
  verifyEmailCode(
    email: string,
    code: string,
    pendingToken: string,
    now: Date,
  ): Promise<EmailVerificationResult>;
  findProfileById(userId: string): Promise<Profile | null>;
  updateProfileDisplayName(
    userId: string,
    displayName: string,
  ): Promise<Profile | null>;
}

export interface AccountRouterConfig {
  cookie: SessionCookieConfig;
  token: TokenConfig;
  mailDelivery?: VerificationMailDelivery;
  now?: () => Date;
  createChallenge?: (now: Date) => VerificationChallengeDraft;
  schedule?: BackgroundTaskScheduler;
}

export type BackgroundTaskScheduler = (task: () => Promise<void>) => void;

function verificationDispatchBody(email: string) {
  return {
    verification: {
      email,
      codeLength: EMAIL_VERIFICATION_CODE_LENGTH,
      expiresInSeconds: EMAIL_VERIFICATION_EXPIRES_IN_SECONDS,
      resendCooldownSeconds: EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    },
  };
}

function clientIp(request: Request) {
  return request.ip || request.socket.remoteAddress || "unknown";
}

function enforceRateLimit(
  limiter: AccountRateLimiter,
  route: string,
  maximumRequests: number,
  email: string,
  now: Date,
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const result = limiter.consume(
    route,
    clientIp(request),
    email,
    maximumRequests,
    now,
  );

  if (result.allowed) {
    return true;
  }

  response.set("Retry-After", String(result.retryAfterSeconds));
  next(
    new HttpError(
      429,
      "RATE_LIMITED",
      "Too many requests. Please try again later.",
    ),
  );
  return false;
}

async function markDeliveryFailedSafely(
  challengeId: string,
  store: AccountStore,
  now: Date,
) {
  try {
    await store.markVerificationChallengeDeliveryFailed(challengeId, now);
  } catch {
    // Undispatched challenges remain unusable even if failure marking fails.
  }
}

async function deliverChallenge(
  preparation: Extract<VerificationDispatchPreparation, { kind: "dispatch" }>,
  draft: VerificationChallengeDraft,
  mailDelivery: VerificationMailDelivery,
  store: AccountStore,
  now: Date,
) {
  try {
    await mailDelivery.sendVerificationCode({
      to: preparation.email,
      code: draft.code,
    });
    await store.markVerificationChallengeDispatched(
      preparation.challengeId,
      now,
    );
  } catch {
    await markDeliveryFailedSafely(preparation.challengeId, store, now);
  }
}

function defaultBackgroundScheduler(task: () => Promise<void>) {
  queueMicrotask(() => {
    void task().catch(() => undefined);
  });
}

function scheduleChallengeDelivery(
  preparation: VerificationDispatchPreparation,
  draft: VerificationChallengeDraft,
  mailDelivery: VerificationMailDelivery,
  store: AccountStore,
  now: Date,
  schedule: BackgroundTaskScheduler,
) {
  if (preparation.kind === "accepted") {
    return;
  }

  try {
    schedule(() =>
      deliverChallenge(preparation, draft, mailDelivery, store, now),
    );
  } catch {
    defaultBackgroundScheduler(() =>
      markDeliveryFailedSafely(preparation.challengeId, store, now),
    );
  }
}

function unavailableMailError() {
  return new HttpError(
    503,
    "SERVICE_UNAVAILABLE",
    "Verification email could not be sent. Please try again.",
  );
}

export function createAccountRouter(
  store: AccountStore,
  config: AccountRouterConfig,
) {
  const router = Router();
  const limiter = new AccountRateLimiter();
  const authenticate = createAuthenticationMiddleware(store, config.token);
  const mailDelivery =
    config.mailDelivery ?? new UnavailableVerificationMailDelivery();
  const currentTime = config.now ?? (() => new Date());
  const challengeFactory =
    config.createChallenge ??
    ((now: Date) => createVerificationChallengeDraft(now));
  const schedule = config.schedule ?? defaultBackgroundScheduler;

  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  router.post("/auth/register", async (request, response, next) => {
    const input = registerInputSchema.safeParse(request.body);

    if (!input.success) {
      next(
        new HttpError(
          400,
          "INVALID_REQUEST",
          "Registration details are invalid.",
        ),
      );
      return;
    }

    const now = currentTime();
    if (
      !enforceRateLimit(
        limiter,
        "register",
        REGISTER_RATE_LIMIT_MAX_REQUESTS,
        input.data.email,
        now,
        request,
        response,
        next,
      )
    ) {
      return;
    }

    if (!mailDelivery.available) {
      next(unavailableMailError());
      return;
    }

    try {
      const passwordHash = await hashPassword(input.data.password);
      const draft = challengeFactory(now);
      const preparation = await store.prepareReaderRegistration(
        {
          displayName: input.data.displayName,
          email: input.data.email,
          passwordHash,
        },
        draft,
        now,
      );
      setPendingVerificationCookie(
        response,
        preparation.kind === "accepted"
          ? preparation.retainedPendingToken ?? draft.pendingToken
          : draft.pendingToken,
        config.cookie,
      );
      scheduleChallengeDelivery(
        preparation,
        draft,
        mailDelivery,
        store,
        now,
        schedule,
      );

      response
        .status(202)
        .json(
          registerResponseSchema.parse(
            verificationDispatchBody(input.data.email),
          ),
        );
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/auth/verify-email", async (request, response, next) => {
    const input = verifyEmailInputSchema.safeParse(request.body);

    if (!input.success) {
      next(
        new HttpError(
          400,
          "INVALID_REQUEST",
          "Verification details are invalid.",
        ),
      );
      return;
    }

    const now = currentTime();
    if (
      !enforceRateLimit(
        limiter,
        "verify-email",
        VERIFY_RATE_LIMIT_MAX_REQUESTS,
        input.data.email,
        now,
        request,
        response,
        next,
      )
    ) {
      return;
    }

    try {
      const result = await store.verifyEmailCode(
        input.data.email,
        input.data.code,
        readPendingVerificationCookie(request.get("cookie")) ?? "",
        now,
      );

      if (result.kind === "invalid") {
        next(
          new HttpError(
            400,
            "VERIFICATION_CODE_INVALID",
            "Verification code is invalid or expired.",
          ),
        );
        return;
      }

      const token = createSessionToken(result.user.id, config.token, now);
      clearPendingVerificationCookie(response, config.cookie);
      setSessionCookie(response, token, config.cookie);
      response
        .status(200)
        .json(verifyEmailResponseSchema.parse({ user: result.user }));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/auth/resend-verification", async (request, response, next) => {
    const input = resendVerificationCodeInputSchema.safeParse(request.body);

    if (!input.success) {
      next(
        new HttpError(
          400,
          "INVALID_REQUEST",
          "Email address is invalid.",
        ),
      );
      return;
    }

    const now = currentTime();
    if (
      !enforceRateLimit(
        limiter,
        "resend-verification",
        RESEND_RATE_LIMIT_MAX_REQUESTS,
        input.data.email,
        now,
        request,
        response,
        next,
      )
    ) {
      return;
    }

    if (!mailDelivery.available) {
      next(unavailableMailError());
      return;
    }

    try {
      const draft = challengeFactory(now);
      const currentPendingToken = readPendingVerificationCookie(
        request.get("cookie"),
      );
      const preparation = await store.prepareVerificationResend(
        input.data.email,
        draft,
        currentPendingToken,
        now,
      );
      setPendingVerificationCookie(
        response,
        preparation.kind === "accepted"
          ? preparation.retainedPendingToken ?? draft.pendingToken
          : draft.pendingToken,
        config.cookie,
      );
      scheduleChallengeDelivery(
        preparation,
        draft,
        mailDelivery,
        store,
        now,
        schedule,
      );

      response.status(202).json(
        resendVerificationCodeResponseSchema.parse(
          verificationDispatchBody(input.data.email),
        ),
      );
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get("/me/profile", authenticate, async (request, response, next) => {
    try {
      const profile = await store.findProfileById(
        requireAuthenticatedUser(request).id,
      );

      if (profile === null) {
        next(
          new HttpError(401, "UNAUTHENTICATED", "Authentication is required."),
        );
        return;
      }

      response.status(200).json(profileResponseSchema.parse({ profile }));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.put("/me/profile", authenticate, async (request, response, next) => {
    const input = updateProfileInputSchema.safeParse(request.body);

    if (!input.success) {
      next(
        new HttpError(400, "INVALID_REQUEST", "Profile details are invalid."),
      );
      return;
    }

    try {
      const profile = await store.updateProfileDisplayName(
        requireAuthenticatedUser(request).id,
        input.data.displayName,
      );

      if (profile === null) {
        next(
          new HttpError(401, "UNAUTHENTICATED", "Authentication is required."),
        );
        return;
      }

      response.status(200).json(profileResponseSchema.parse({ profile }));
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
