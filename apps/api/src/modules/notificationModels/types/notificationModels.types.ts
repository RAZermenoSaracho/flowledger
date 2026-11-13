import type { NotificationSlot } from "@flowledger/shared";

/** Slot definitions of a model, as stored in its `slots` JSON column. */
export type ModelSlots = NotificationSlot[];

/** Map of slot key to bound record id, as stored in a model's `bindings` JSON column. */
export type ModelBindings = Record<string, string>;

/** Untrusted decoded `query` request param for model, queue and log lists. */
export interface NotificationListQueryInput {
  where?: unknown;
  sort?: unknown;
  pagination?: unknown;
}

/** Result of testing a script against sample text; nothing is persisted. */
export interface NotificationTestResult {
  outcome: "proposal" | "skip" | "error";
  proposal?: Record<string, unknown>;
  transactionPreview?: Record<string, unknown>;
  reason?: string;
  validationErrors?: string[];
  error?: { message: string; line?: number | null };
  stdout: string;
}
