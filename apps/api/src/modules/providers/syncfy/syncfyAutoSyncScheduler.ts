import { env } from "../../../config/env.js";
import { prisma } from "../../../db/prisma.js";
import { resyncSyncfyConnection } from "./syncfy.service.js";

type SyncfyAutoSyncJob = {
  connectionId: string;
  userId: string;
};

type SyncfyAutoSyncSchedulerOptions = {
  enabled: boolean;
  intervalMinutes: number;
  jobTimeoutMs: number;
  concurrency: number;
  loadJobs: () => Promise<SyncfyAutoSyncJob[]>;
  processJob: (job: SyncfyAutoSyncJob, timeoutMs: number) => Promise<unknown>;
  log?: Pick<typeof console, "info" | "warn" | "error">;
};

export class SyncfyAutoSyncScheduler {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(private readonly options: SyncfyAutoSyncSchedulerOptions) {}

  start() {
    if (!this.options.enabled || this.timer) return false;

    const intervalMs = this.options.intervalMinutes * 60 * 1000;
    this.timer = setInterval(() => {
      void this.runOnce();
    }, intervalMs);

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
      const workers = Array.from(
        { length: Math.max(1, this.options.concurrency) },
        async (_, workerIndex) => {
          for (let index = workerIndex; index < jobs.length; index += this.options.concurrency) {
            const job = jobs[index];
            if (!job) continue;

            try {
              await this.options.processJob(job, this.options.jobTimeoutMs);
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

export function createSyncfyAutoSyncScheduler() {
  return new SyncfyAutoSyncScheduler({
    enabled: env.SYNCFY_AUTO_SYNC_ENABLED,
    intervalMinutes: env.SYNCFY_AUTO_SYNC_INTERVAL_MINUTES,
    jobTimeoutMs: env.SYNCFY_AUTO_SYNC_JOB_TIMEOUT_MS,
    concurrency: env.SYNCFY_AUTO_SYNC_CONCURRENCY,
    log: console,
    loadJobs: async () => {
      const connections = await prisma.providerConnection.findMany({
        where: {
          provider: "syncfy",
          status: { in: ["active", "sync_failed"] },
          requiresManualReconnect: false,
          accounts: {
            some: {
              status: { in: ["active", "sync_failed"] },
              requiresManualReconnect: false,
              accountId: { not: null }
            }
          }
        },
        select: {
          id: true,
          userId: true
        },
        orderBy: [{ lastSyncAt: "asc" }, { createdAt: "asc" }]
      });

      return connections.map((connection) => ({
        connectionId: connection.id,
        userId: connection.userId
      }));
    },
    processJob: (job, timeoutMs) =>
      resyncSyncfyConnection({
        userId: job.userId,
        connectionId: job.connectionId,
        timeoutMs
      })
  });
}
