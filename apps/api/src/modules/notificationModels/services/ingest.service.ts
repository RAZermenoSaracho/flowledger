import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { HttpError, notFound } from "../../../utils/httpError.js";

/** Maximum `queued` runs one user may have across all models. */
export const MAX_QUEUED_PER_USER = 500;
const DEDUPE_BUCKET_MS = 10 * 60_000;

/** Result of an ingest: the queued (or pre-existing) run and whether it was a duplicate. */
export interface IngestResult {
  runId: string;
  status: string;
  duplicate: boolean;
}

/**
 * Persists a notification as a `queued` run for the owner's active model; never executes it.
 * Dedupe key is `idempotencyKey` when given, else `sha256(text):<10-minute bucket>`; a unique-key
 * conflict returns the existing run with `duplicate: true`.
 * Throws 404 (missing/foreign/inactive model), 429 (500 queued runs), 503 (any other DB failure).
 */
export async function ingestNotification(
  userId: string,
  modelId: string,
  text: string,
  idempotencyKey?: string,
  now = new Date()
): Promise<IngestResult> {
  const dedupeKey =
    idempotencyKey ??
    `${createHash("sha256").update(text).digest("hex")}:${Math.floor(now.getTime() / DEDUPE_BUCKET_MS)}`;
  try {
    const model = await prisma.notificationModel.findFirst({
      where: { id: modelId, userId, isActive: true },
      select: { id: true }
    });
    if (!model) throw notFound("Notification model");

    const queued = await prisma.notificationRun.count({ where: { userId, status: "queued" } });
    if (queued >= MAX_QUEUED_PER_USER) throw new HttpError(429, "Notification queue is full");

    try {
      const run = await prisma.notificationRun.create({
        data: { modelId, userId, text, dedupeKey, receivedAt: now },
        select: { id: true, status: true }
      });
      return { runId: run.id, status: run.status, duplicate: false };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const existing = await prisma.notificationRun.findUniqueOrThrow({
        where: { modelId_dedupeKey: { modelId, dedupeKey } },
        select: { id: true, status: true }
      });
      return { runId: existing.id, status: existing.status, duplicate: true };
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, "Notification queue unavailable");
  }
}
