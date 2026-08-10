import { env } from "../../../../config/env.js";
import { loadActiveSyncfyAutoSyncJobs } from "./services/read.service.js";
import {
  getManualSyncfyRefreshRetryDelaysMs,
  resyncSyncfyConnection
} from "./services/update.service.js";

type SyncfyAutoSyncJob = {
  connectionId: string;
  userId: string;
};

type SyncfyAutoSyncSchedulerOptions = {
  enabled: boolean;
  intervalMinutes: number;
  jobTimeoutMs: number;
  concurrency: number;
  retryDelaysMs?: readonly number[];
  loadJobs: () => Promise<SyncfyAutoSyncJob[]>;
  processJob: (
    job: SyncfyAutoSyncJob,
    timeoutMs: number,
    retryDelaysMs: readonly number[]
  ) => Promise<unknown>;
  log?: Pick<typeof console, "info" | "warn" | "error">;
};

/** Periodically resyncs eligible Syncfy connections on a fixed interval, running jobs with bounded concurrency and skipping a tick if the previous run is still in progress. */
export class SyncfyAutoSyncScheduler {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(private readonly options: SyncfyAutoSyncSchedulerOptions) {}

  start() {
    if (!this.options.enabled || this.timer) return false;

    const intervalMs = this.options.intervalMinutes * 60 * 1000;
    const retryDelaysMs = this.options.retryDelaysMs ?? [];
    this.timer = setInterval(() => {
      void this.runOnce();
    }, intervalMs);

    this.options.log?.info("[SYNCFY AUTO SYNC] Scheduler started", {
      intervalMinutes: this.options.intervalMinutes,
      jobTimeoutMs: this.options.jobTimeoutMs,
      concurrency: this.options.concurrency,
      retryDelaysMs
    });
    void this.runOnce();
    return true;
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  isRunning() {
    return this.running;
  }

  async runOnce() {
    if (!this.options.enabled) {
      return { skipped: true, reason: "disabled" as const };
    }

    if (this.running) {
      this.options.log?.warn("[SYNCFY AUTO SYNC] Skipping overlapping run");
      return { skipped: true, reason: "overlap" as const };
    }

    this.running = true;
    const startedAt = new Date();
    let processed = 0;
    let failed = 0;

    try {
      const jobs = await this.options.loadJobs();
      const retryDelaysMs = this.options.retryDelaysMs ?? [];
      const workers = Array.from(
        { length: Math.max(1, this.options.concurrency) },
        async (_, workerIndex) => {
          for (let index = workerIndex; index < jobs.length; index += this.options.concurrency) {
            const job = jobs[index];
            if (!job) continue;

            try {
              await this.options.processJob(
                job,
                this.options.jobTimeoutMs,
                retryDelaysMs
              );
              processed += 1;
            } catch (error) {
              failed += 1;
              this.options.log?.error("[SYNCFY AUTO SYNC] Job failed", {
                connectionId: job.connectionId,
                userId: job.userId,
                error: error instanceof Error ? error.message : "Unknown error"
              });
            }
          }
        }
      );

      await Promise.all(workers);

      this.options.log?.info("[SYNCFY AUTO SYNC] Run complete", {
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        queued: jobs.length,
        processed,
        failed
      });

      return { skipped: false, queued: jobs.length, processed, failed };
    } finally {
      this.running = false;
    }
  }
}

/** Reads the auto-sync scheduler's enabled/interval/timeout/concurrency settings from env, plus the shared manual-refresh retry-delay schedule. */
export function getSyncfyAutoSyncSchedulerConfig() {
  return {
    enabled: env.SYNCFY_AUTO_SYNC_ENABLED,
    intervalMinutes: env.SYNCFY_AUTO_SYNC_INTERVAL_MINUTES,
    jobTimeoutMs: env.SYNCFY_AUTO_SYNC_JOB_TIMEOUT_MS,
    concurrency: env.SYNCFY_AUTO_SYNC_CONCURRENCY,
    retryDelaysMs: getManualSyncfyRefreshRetryDelaysMs()
  };
}

/** Builds a {@link SyncfyAutoSyncScheduler} wired to env config, Prisma-backed job loading, and `resyncSyncfyConnection` as the per-job processor. */
export function createSyncfyAutoSyncScheduler() {
  const config = getSyncfyAutoSyncSchedulerConfig();

  return new SyncfyAutoSyncScheduler({
    ...config,
    log: console,
    loadJobs: loadActiveSyncfyAutoSyncJobs,
    processJob: (job, timeoutMs, retryDelaysMs) =>
      resyncSyncfyConnection({
        userId: job.userId,
        connectionId: job.connectionId,
        timeoutMs,
        retryDelaysMs
      })
  });
}
