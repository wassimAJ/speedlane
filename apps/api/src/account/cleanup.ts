export const ACCOUNT_SETUP_CLEANUP_BATCH_SIZE = 100;
export const ACCOUNT_SETUP_CLEANUP_MAX_BATCHES_PER_RUN = 100;
export const ACCOUNT_SETUP_CLEANUP_INTERVAL_MS = 5 * 60 * 1_000;

interface CleanupTimer {
  unref?: () => void;
}

export interface AccountSetupCleanupLifecycleConfig {
  cleanup: (
    now: Date,
    batchSize: number,
  ) => Promise<{ mayHaveMore?: boolean }>;
  now?: () => Date;
  batchSize?: number;
  maxBatchesPerRun?: number;
  intervalMs?: number;
  onPeriodicError?: () => void;
  onBacklogLimit?: () => void;
  setInterval?: (callback: () => void, intervalMs: number) => CleanupTimer;
  clearInterval?: (timer: CleanupTimer) => void;
}

export interface AccountSetupCleanupLifecycle {
  stop(): void;
}

export async function startAccountSetupCleanup({
  cleanup,
  now = () => new Date(),
  batchSize = ACCOUNT_SETUP_CLEANUP_BATCH_SIZE,
  maxBatchesPerRun = ACCOUNT_SETUP_CLEANUP_MAX_BATCHES_PER_RUN,
  intervalMs = ACCOUNT_SETUP_CLEANUP_INTERVAL_MS,
  onPeriodicError = () => {
    console.error("Periodic expired account setup cleanup failed.");
  },
  onBacklogLimit = () => {
    console.warn("Expired account setup cleanup reached its per-run limit.");
  },
  setInterval: createInterval = (callback, milliseconds) =>
    setInterval(callback, milliseconds),
  clearInterval: cancelInterval = (timer) =>
    clearInterval(timer as ReturnType<typeof setInterval>),
}: AccountSetupCleanupLifecycleConfig): Promise<AccountSetupCleanupLifecycle> {
  if (!Number.isSafeInteger(maxBatchesPerRun) || maxBatchesPerRun < 1) {
    throw new RangeError("Account setup cleanup run limit must be positive.");
  }
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) {
    throw new RangeError("Account setup cleanup interval must be positive.");
  }

  const reportSafely = (report: () => void) => {
    try {
      report();
    } catch {
      // Operational reporting must never interrupt cleanup or startup.
    }
  };
  const drainExpiredSetup = async () => {
    const cutoff = now();
    for (let batch = 0; batch < maxBatchesPerRun; batch += 1) {
      const result = await cleanup(cutoff, batchSize);
      if (result.mayHaveMore !== true) {
        return;
      }
    }
    reportSafely(onBacklogLimit);
  };

  await drainExpiredSetup();

  let cleanupRunning = false;
  let stopped = false;
  const timer = createInterval(() => {
    if (stopped || cleanupRunning) {
      return;
    }

    cleanupRunning = true;
    void drainExpiredSetup()
      .catch(() => {
        reportSafely(onPeriodicError);
      })
      .finally(() => {
        cleanupRunning = false;
      });
  }, intervalMs);
  timer.unref?.();

  return {
    stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      cancelInterval(timer);
    },
  };
}
