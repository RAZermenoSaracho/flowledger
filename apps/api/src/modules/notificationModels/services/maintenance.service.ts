import type { NotificationRunStatus } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";

const WORKER_LIVE_MS = 2 * 60_000;
const WORKER_ROW_TTL_MS = 60 * 60_000;
const TEXT_RETENTION_MS = 7 * 86_400_000;
const RUN_RETENTION_MS = 30 * 86_400_000;

const terminal = { in: ["completed", "skipped", "failed"] as NotificationRunStatus[] };

/**
 * Fails `processing` runs whose claiming worker has not been seen for 2 minutes (reason `worker_lost`)
 * and deletes worker rows unseen for 1 hour. Returns the number of runs failed.
 */
export async function failLostRuns(now = new Date()) {
  const live = await prisma.notificationWorker.findMany({
    where: { lastSeenAt: { gte: new Date(now.getTime() - WORKER_LIVE_MS) } },
    select: { id: true }
  });
  const { count } = await prisma.notificationRun.updateMany({
    where: { status: "processing", workerId: { notIn: live.map((w) => w.id) } },
    data: { status: "failed", reason: "worker_lost", finishedAt: now }
  });
  await prisma.notificationWorker.deleteMany({
    where: { lastSeenAt: { lt: new Date(now.getTime() - WORKER_ROW_TTL_MS) } }
  });
  return count;
}

/**
 * Nulls `text` on terminal runs finished over 7 days ago and deletes terminal runs finished over
 * 30 days ago. Never touches `queued` or `processing` runs.
 */
export async function applyRetention(now = new Date()) {
  const textCutoff = new Date(now.getTime() - TEXT_RETENTION_MS);
  const runCutoff = new Date(now.getTime() - RUN_RETENTION_MS);
  await prisma.notificationRun.updateMany({
    where: { status: terminal, finishedAt: { lt: textCutoff }, text: { not: null } },
    data: { text: null }
  });
  await prisma.notificationRun.deleteMany({
    where: { status: terminal, finishedAt: { lt: runCutoff } }
  });
}
