import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { claimNextRun } from "./services/claim.service.js";
import { applyRetention, failLostRuns } from "./services/maintenance.service.js";
import { processRun } from "./services/processRun.service.js";

const POLL_MS = 2_000;
const TOUCH_MS = 15_000;
const MAINTENANCE_MS = 60_000;
const STOP_TIMEOUT_MS = 10_000;

const isAbort = (error: unknown) => error instanceof Error && error.name === "AbortError";
// Prisma messages can echo query arguments (notification text), so logs carry only the error code or name.
const errorLabel = (error: unknown) => (error as { code?: string }).code ?? (error as Error).name ?? "Error";

/**
 * Claims and executes queued notification runs for one worker process: polls every 2 s up to the
 * global concurrency limit, heartbeats its `NotificationWorker` row every 15 s and runs recovery
 * plus retention every minute. Started only by `src/worker.ts`; never logs notification text.
 */
export class NotificationRunWorker {
  readonly workerId = randomUUID();
  private readonly inFlight = new Map<string, { controller: AbortController; done: Promise<void> }>();
  private timers: NodeJS.Timeout[] = [];
  private stopping = false;
  private ticking = false;

  /** Registers the worker row, runs maintenance once, then starts the poll, heartbeat and maintenance timers. */
  async start() {
    await prisma.notificationWorker.create({ data: { id: this.workerId, hostname: hostname(), pid: process.pid } });
    await this.maintain();
    this.timers = [
      setInterval(() => void this.tick(), POLL_MS),
      setInterval(() => void this.touch(), TOUCH_MS),
      setInterval(() => void this.maintain(), MAINTENANCE_MS)
    ];
  }

  /**
   * Stops claiming, aborts sandbox executions (returning those runs to `queued`), lets runs already
   * in their create step finish, waits at most 10 s, then deletes the worker row.
   */
  async stop() {
    this.stopping = true;
    this.timers.forEach(clearInterval);
    this.timers = [];
    const pending = [...this.inFlight.values()];
    pending.forEach(({ controller }) => controller.abort());
    let timeout: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.all(pending.map((p) => p.done)),
      new Promise((resolve) => (timeout = setTimeout(resolve, STOP_TIMEOUT_MS)))
    ]);
    clearTimeout(timeout);
    await prisma.notificationWorker.deleteMany({ where: { id: this.workerId } });
  }

  /** Claims runs until none is available or the in-flight count reaches the global limit. */
  async tick() {
    if (this.stopping || this.ticking) return;
    this.ticking = true;
    try {
      while (!this.stopping && this.inFlight.size < env.NOTIFICATION_PROCESSOR_MAX_CONCURRENT_GLOBAL) {
        const run = await claimNextRun(this.workerId);
        if (!run) break;
        this.launch(run);
      }
    } catch (error) {
      console.error("notification worker: claim failed", { workerId: this.workerId, error: errorLabel(error) });
    } finally {
      this.ticking = false;
    }
  }

  private launch(run: NonNullable<Awaited<ReturnType<typeof claimNextRun>>>) {
    const controller = new AbortController();
    const done = processRun(run, { signal: controller.signal })
      .then(() => undefined)
      .catch(async (error) => {
        if (isAbort(error)) {
          await prisma.notificationRun.updateMany({
            where: { id: run.id, status: "processing", workerId: this.workerId },
            data: { status: "queued", workerId: null, startedAt: null }
          });
          return;
        }
        console.error("notification worker: run failed", { workerId: this.workerId, runId: run.id, error: errorLabel(error) });
        // A live worker keeps its liveness row fresh, so recovery would never fail this run; fail it here.
        await prisma.notificationRun
          .updateMany({
            where: { id: run.id, status: "processing", workerId: this.workerId },
            data: { status: "failed", reason: "internal_error", finishedAt: new Date() }
          })
          .catch(() => undefined);
      })
      .finally(() => this.inFlight.delete(run.id));
    this.inFlight.set(run.id, { controller, done });
  }

  private async touch() {
    try {
      await prisma.notificationWorker.updateMany({ where: { id: this.workerId }, data: { lastSeenAt: new Date() } });
    } catch (error) {
      console.error("notification worker: heartbeat failed", { workerId: this.workerId, error: errorLabel(error) });
    }
  }

  private async maintain() {
    try {
      await failLostRuns();
      await applyRetention();
    } catch (error) {
      console.error("notification worker: maintenance failed", { workerId: this.workerId, error: errorLabel(error) });
    }
  }
}
