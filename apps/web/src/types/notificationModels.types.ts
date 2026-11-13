import type { NotificationRules, NotificationSlot } from "@flowledger/shared";
import type { DataSieveMeta } from "./transactions.types";

/** Whether a model is private to its owner or published to the library. */
export type NotificationModelVisibility = "private" | "public";

/** Lifecycle status of one notification run. */
export type NotificationRunStatus = "queued" | "processing" | "completed" | "skipped" | "failed";

/** Library update info of a copy; `localCodeModified` is true when its code differs from the installed version. */
export type NotificationModelUpdateInfo = {
  available: boolean;
  installedVersion: number | null;
  latestVersion: number | null;
  localCodeModified: boolean;
  /** Library model the copy came from; with `latestVersionId` it locates the update. */
  sourceModelId?: string;
  /** Id of the newest public version, sent as `versionId` when updating. */
  latestVersionId?: string;
};

/** Derived publication state: `published` only when the model is public and has a version. */
export type NotificationModelPublication = { published: boolean; latestVersion: number | null; publishedAt: string | null };

/** A public library model's latest version; `code` is present only on the single-entry read. */
export type NotificationLibraryEntry = {
  modelId: string;
  versionId: string;
  version: number;
  name: string;
  description: string | null;
  slots: NotificationSlot[];
  settings: Record<string, string>;
  publishedAt: string;
  author: { username: string | null };
  /** True when the caller authored this model; own entries cannot be installed. */
  isOwn: boolean;
  /** Id of the caller's installed copy of this model, or `null`. */
  installedModelId: string | null;
  code?: string;
};

/** A notification model as listed by `GET /notification-models`. */
export type NotificationModelSummary = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  visibility: NotificationModelVisibility;
  publication: NotificationModelPublication;
  lastRunStatus: NotificationRunStatus | null;
  endpointPath: string;
  createdAt: string;
  updatedAt: string;
};

/** A full notification model as returned by `GET /notification-models/:id` and the write routes (which omit the derived fields). */
export type NotificationModel = NotificationModelSummary & {
  code: string;
  slots: NotificationSlot[];
  bindings: Record<string, string>;
  settings: Record<string, string>;
  sourceVersionId: string | null;
  update?: NotificationModelUpdateInfo;
  queued?: number;
  processing?: number;
};

/** One run row of `/queue` (text cut to 80 characters) or `/logs` (full text, `null` once retention cleared it). */
export type NotificationRun = {
  id: string;
  modelId: string;
  status: NotificationRunStatus;
  text: string | null;
  reason: string | null;
  transactionId: string | null;
  receivedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

/** A paginated DataSieve response. */
export type NotificationPage<T> = { data: T[]; meta: DataSieveMeta };

/** One validation error of a script. */
export type NotificationCodeError = { line: number; col: number; message: string };

/** Result of `POST /notification-models/:id/test`; nothing is persisted. */
export type NotificationTestResult = {
  outcome: "proposal" | "skip" | "error";
  proposal?: Record<string, unknown>;
  transactionPreview?: Record<string, unknown>;
  reason?: string;
  validationErrors?: string[];
  error?: { message: string; line?: number | null };
  stdout: string;
};

/** Answer of `POST /notification-models/parse-rules`: the script as rules, the constructs the visual editor cannot represent, or its syntax errors. */
export type NotificationRulesParseResult =
  | { rules: NotificationRules }
  | { unsupported: { line: number; message: string }[] }
  | { errors: { line: number; col?: number; message: string }[] };
