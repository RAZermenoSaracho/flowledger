import type { Request, Response } from "express";
import { HttpError, badRequest } from "../../../utils/httpError.js";
import { ingestNotification } from "../services/ingest.service.js";

/** `POST /v1/notification-models/:id/notifications`: queues the notification text and answers 202 `{ runId, status, duplicate }` once it is persisted. */
export async function postIngest(req: Request, res: Response) {
  const key = req.header("Idempotency-Key");
  if (key !== undefined && (key.length === 0 || key.length > 128)) {
    throw badRequest("Idempotency-Key must be 1 to 128 characters");
  }
  try {
    const result = await ingestNotification(req.user!.id, req.params.id!, req.body.text, key);
    res.status(202).json(result);
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 429) res.set("Retry-After", "60");
    throw error;
  }
}
