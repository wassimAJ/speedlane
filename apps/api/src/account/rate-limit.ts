import { AUTH_RATE_LIMIT_WINDOW_SECONDS } from "@amazon-2/contracts";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

// This limiter is process-local. A multi-instance deployment should replace it
// with a shared store. The hard cap fails closed for unseen keys while all
// retained buckets are active, bounding memory rather than evicting protection.
export class AccountRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(private readonly maximumBuckets = 10_000) {
    if (!Number.isInteger(maximumBuckets) || maximumBuckets < 2) {
      throw new Error("Account rate limiter requires at least two buckets.");
    }
  }

  get bucketCount() {
    return this.buckets.size;
  }

  consume(
    route: string,
    clientIp: string,
    normalizedEmail: string,
    maximumRequests: number,
    now = new Date(),
  ): RateLimitResult {
    const nowMilliseconds = now.getTime();
    this.pruneExpired(nowMilliseconds);
    const keys = [
      `${route}\0ip\0${clientIp}`,
      `${route}\0email\0${normalizedEmail.trim().toLowerCase()}`,
    ];
    const blockedBuckets = keys
      .map((key) => this.buckets.get(key))
      .filter(
        (bucket): bucket is RateLimitBucket =>
          bucket !== undefined && bucket.count >= maximumRequests,
      );

    if (blockedBuckets.length > 0) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          ...blockedBuckets.map((bucket) =>
            Math.ceil((bucket.resetAt - nowMilliseconds) / 1_000),
          ),
        ),
      };
    }

    const missingBucketCount = keys.filter(
      (key) => !this.buckets.has(key),
    ).length;
    if (this.buckets.size + missingBucketCount > this.maximumBuckets) {
      const earliestResetAt = Math.min(
        ...Array.from(this.buckets.values(), (bucket) => bucket.resetAt),
      );
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((earliestResetAt - nowMilliseconds) / 1_000),
        ),
      };
    }

    for (const key of keys) {
      const existing = this.buckets.get(key);
      if (existing === undefined) {
        this.buckets.set(key, {
          count: 1,
          resetAt: nowMilliseconds + AUTH_RATE_LIMIT_WINDOW_SECONDS * 1_000,
        });
      } else {
        existing.count += 1;
      }
    }

    return { allowed: true };
  }

  private pruneExpired(nowMilliseconds: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= nowMilliseconds) {
        this.buckets.delete(key);
      }
    }
  }
}
