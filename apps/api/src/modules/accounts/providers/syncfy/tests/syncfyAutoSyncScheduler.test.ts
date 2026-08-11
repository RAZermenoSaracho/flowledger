import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../config/env.js", () => ({
  env: {
    SYNCFY_AUTO_SYNC_ENABLED: true,
    SYNCFY_AUTO_SYNC_INTERVAL_MINUTES: 17,
    SYNCFY_AUTO_SYNC_JOB_TIMEOUT_MS: 45678,
    SYNCFY_AUTO_SYNC_CONCURRENCY: 3
  }
}));

vi.mock("../services/read.service.js", () => ({
  loadActiveSyncfyAutoSyncJobs: vi.fn().mockResolvedValue([])
}));

vi.mock("../services/update.service.js", () => ({
  getManualSyncfyRefreshRetryDelaysMs: vi.fn(),
  resyncSyncfyConnection: vi.fn()
}));

const {
  createSyncfyAutoSyncScheduler,
  getSyncfyAutoSyncSchedulerConfig,
  SyncfyAutoSyncScheduler
} = await import("../syncfyAutoSyncScheduler.js");
const { getManualSyncfyRefreshRetryDelaysMs } = await import(
  "../services/update.service.js"
);

describe("getSyncfyAutoSyncSchedulerConfig", () => {
  it("reads scheduler settings from env plus the retry-delay schedule", () => {
    vi.mocked(getManualSyncfyRefreshRetryDelaysMs).mockReturnValue([0, 5000]);

    expect(getSyncfyAutoSyncSchedulerConfig()).toEqual({
      enabled: true,
      intervalMinutes: 17,
      jobTimeoutMs: 45678,
      concurrency: 3,
      retryDelaysMs: [0, 5000]
    });
  });
});

describe("createSyncfyAutoSyncScheduler", () => {
  it("builds a scheduler instance without throwing", () => {
    expect(() => createSyncfyAutoSyncScheduler()).not.toThrow();
  });
});

describe("SyncfyAutoSyncScheduler", () => {
  function buildScheduler(overrides: Partial<ConstructorParameters<typeof SyncfyAutoSyncScheduler>[0]> = {}) {
    return new SyncfyAutoSyncScheduler({
      enabled: true,
      intervalMinutes: 60,
      jobTimeoutMs: 1000,
      concurrency: 2,
      loadJobs: vi.fn().mockResolvedValue([]),
      processJob: vi.fn().mockResolvedValue(undefined),
      ...overrides
    });
  }

  it("is not running before start()", () => {
    expect(buildScheduler().isRunning()).toBe(false);
  });

  it("start()/stop() do not throw", () => {
    vi.useFakeTimers();
    const scheduler = buildScheduler();

    expect(() => scheduler.start()).not.toThrow();
    expect(() => scheduler.stop()).not.toThrow();
    vi.useRealTimers();
  });

  it("start() returns false and does not schedule when disabled", () => {
    vi.useFakeTimers();
    const scheduler = buildScheduler({ enabled: false });

    expect(scheduler.start()).toBe(false);
    vi.useRealTimers();
  });

  describe("runOnce", () => {
    it("skips with reason 'disabled' when the scheduler is disabled", async () => {
      const scheduler = buildScheduler({ enabled: false });
      await expect(scheduler.runOnce()).resolves.toEqual({
        skipped: true,
        reason: "disabled"
      });
    });

    it("processes every loaded job and reports processed/failed counts", async () => {
      const processJob = vi.fn().mockResolvedValue(undefined);
      const scheduler = buildScheduler({
        loadJobs: vi
          .fn()
          .mockResolvedValue([
            { connectionId: "c1", userId: "u1" },
            { connectionId: "c2", userId: "u2" }
          ]),
        processJob
      });

      const result = await scheduler.runOnce();

      expect(processJob).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        skipped: false,
        queued: 2,
        processed: 2,
        failed: 0
      });
    });

    it("counts a job that throws as failed, without failing the whole run", async () => {
      const scheduler = buildScheduler({
        loadJobs: vi
          .fn()
          .mockResolvedValue([{ connectionId: "c1", userId: "u1" }]),
        processJob: vi.fn().mockRejectedValue(new Error("job failed"))
      });

      const result = await scheduler.runOnce();
      expect(result).toEqual({ skipped: false, queued: 1, processed: 0, failed: 1 });
    });

    it("prevents overlapping runs: a second runOnce() while one is in flight resolves immediately", async () => {
      let resolveFirstJob!: () => void;
      const scheduler = buildScheduler({
        loadJobs: vi
          .fn()
          .mockResolvedValue([{ connectionId: "c1", userId: "u1" }]),
        processJob: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveFirstJob = resolve;
            })
        )
      });

      const firstRun = scheduler.runOnce();
      await Promise.resolve();
      expect(scheduler.isRunning()).toBe(true);

      const secondRun = await scheduler.runOnce();
      expect(secondRun).toEqual({ skipped: true, reason: "overlap" });

      resolveFirstJob();
      await firstRun;
      expect(scheduler.isRunning()).toBe(false);
    });

    it("resets isRunning() to false even when loadJobs throws", async () => {
      const scheduler = buildScheduler({
        loadJobs: vi.fn().mockRejectedValue(new Error("db down"))
      });

      await expect(scheduler.runOnce()).rejects.toThrow("db down");
      expect(scheduler.isRunning()).toBe(false);
    });
  });
});
