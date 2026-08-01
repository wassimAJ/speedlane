import { describe, expect, it, vi } from "vitest";

import {
  ACCOUNT_SETUP_CLEANUP_BATCH_SIZE,
  ACCOUNT_SETUP_CLEANUP_INTERVAL_MS,
  ACCOUNT_SETUP_CLEANUP_MAX_BATCHES_PER_RUN,
  startAccountSetupCleanup,
} from "./cleanup.js";

const now = new Date("2026-08-01T12:00:00.000Z");

async function flushPeriodicWork() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("account setup cleanup lifecycle", () => {
  it("awaits startup cleanup, then schedules an unrefed periodic pass that can stop", async () => {
    const cleanup = vi.fn().mockResolvedValue({ mayHaveMore: false });
    const unref = vi.fn();
    const clearInterval = vi.fn();
    let periodicCallback: (() => void) | undefined;
    const timer = { unref };

    const lifecycle = await startAccountSetupCleanup({
      cleanup,
      now: () => now,
      setInterval: (callback, intervalMs) => {
        periodicCallback = callback;
        expect(intervalMs).toBe(ACCOUNT_SETUP_CLEANUP_INTERVAL_MS);
        return timer;
      },
      clearInterval,
    });

    expect(cleanup).toHaveBeenCalledWith(
      now,
      ACCOUNT_SETUP_CLEANUP_BATCH_SIZE,
    );
    expect(ACCOUNT_SETUP_CLEANUP_MAX_BATCHES_PER_RUN).toBe(100);
    expect(
      ACCOUNT_SETUP_CLEANUP_BATCH_SIZE *
        ACCOUNT_SETUP_CLEANUP_MAX_BATCHES_PER_RUN,
    ).toBe(10_000);
    expect(unref).toHaveBeenCalledOnce();
    periodicCallback?.();
    await flushPeriodicWork();
    expect(cleanup).toHaveBeenCalledTimes(2);

    lifecycle.stop();
    lifecycle.stop();
    expect(clearInterval).toHaveBeenCalledOnce();
    expect(clearInterval).toHaveBeenCalledWith(timer);
    periodicCallback?.();
    await flushPeriodicWork();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("fails startup explicitly without scheduling when the initial pass fails", async () => {
    const createInterval = vi.fn();

    await expect(
      startAccountSetupCleanup({
        cleanup: vi.fn().mockRejectedValue(new Error("database detail")),
        setInterval: createInterval,
      }),
    ).rejects.toThrow("database detail");
    expect(createInterval).not.toHaveBeenCalled();
  });

  it("drains more than one hundred expired rows before scheduling periodic work", async () => {
    let remainingRows = 250;
    const cleanup = vi.fn(async (_cutoff: Date, batchSize: number) => {
      remainingRows -= Math.min(remainingRows, batchSize);
      return { mayHaveMore: remainingRows > 0 };
    });

    await startAccountSetupCleanup({
      cleanup,
      now: () => now,
      setInterval: () => ({ unref: vi.fn() }),
      clearInterval: vi.fn(),
    });

    expect(cleanup).toHaveBeenCalledTimes(3);
    expect(remainingRows).toBe(0);
    expect(cleanup).toHaveBeenNthCalledWith(
      1,
      now,
      ACCOUNT_SETUP_CLEANUP_BATCH_SIZE,
    );
    for (let call = 2; call <= 3; call += 1) {
      expect(cleanup).toHaveBeenNthCalledWith(
        call,
        now,
        ACCOUNT_SETUP_CLEANUP_BATCH_SIZE,
      );
    }
  });

  it("stops draining at the hard cap and reports only a generic backlog event", async () => {
    const cleanup = vi.fn().mockResolvedValue({ mayHaveMore: true });
    const onBacklogLimit = vi.fn(() => {
      throw new Error("reporting failure");
    });
    let periodicCallback: (() => void) | undefined;

    await startAccountSetupCleanup({
      cleanup,
      maxBatchesPerRun: 3,
      onBacklogLimit,
      setInterval: (callback) => {
        periodicCallback = callback;
        return { unref: vi.fn() };
      },
      clearInterval: vi.fn(),
    });

    expect(cleanup).toHaveBeenCalledTimes(3);
    expect(onBacklogLimit).toHaveBeenCalledWith();

    periodicCallback?.();
    await flushPeriodicWork();
    expect(cleanup).toHaveBeenCalledTimes(6);
    expect(onBacklogLimit).toHaveBeenCalledTimes(2);
  });

  it("logs no failure detail, avoids overlap, and retries after periodic failure", async () => {
    let rejectPeriodic: ((reason: Error) => void) | undefined;
    const periodic = new Promise<{ mayHaveMore: false }>((_resolve, reject) => {
      rejectPeriodic = reject;
    });
    const cleanup = vi
      .fn()
      .mockResolvedValueOnce({ mayHaveMore: false })
      .mockReturnValueOnce(periodic)
      .mockResolvedValue({ mayHaveMore: false });
    const onPeriodicError = vi.fn(() => {
      throw new Error("reporting failure");
    });
    let periodicCallback: (() => void) | undefined;

    await startAccountSetupCleanup({
      cleanup,
      onPeriodicError,
      setInterval: (callback) => {
        periodicCallback = callback;
        return { unref: vi.fn() };
      },
      clearInterval: vi.fn(),
    });

    periodicCallback?.();
    periodicCallback?.();
    expect(cleanup).toHaveBeenCalledTimes(2);
    rejectPeriodic?.(new Error("secret database detail"));
    await flushPeriodicWork();
    expect(onPeriodicError).toHaveBeenCalledWith();

    periodicCallback?.();
    await flushPeriodicWork();
    expect(cleanup).toHaveBeenCalledTimes(3);
  });
});
