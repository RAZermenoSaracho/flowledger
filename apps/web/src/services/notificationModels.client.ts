import type { RangePagination } from "../types/common.types";
import type {
  NotificationCodeError,
  NotificationLibraryEntry,
  NotificationModel,
  NotificationModelSummary,
  NotificationPage,
  NotificationRun,
  NotificationTestResult
} from "../types/notificationModels.types";
import { ApiError, apiRequest, apiUrl } from "./api.client";

/** Writable fields of a notification model; `description: null` clears it. */
export type NotificationModelBody = {
  name?: string;
  description?: string | null;
  code?: string;
  slots?: NotificationModel["slots"];
  bindings?: Record<string, string>;
  settings?: Record<string, string>;
  isActive?: boolean;
  /** Only `"private"` is accepted (unpublish); publishing goes through {@link publishNotificationModel}. */
  visibility?: "private";
};

/**
 * Turns a rejected save into a plain `Error` the form can show: script errors become
 * "line N: message" lines addressed to `code`, unbound required slots are addressed to `isActive`.
 */
function toSaveError(error: unknown): never {
  if (!(error instanceof ApiError)) throw error;
  const body = error.body as { errors?: NotificationCodeError[]; unboundSlots?: string[] } | null;
  if (body?.errors?.length) {
    const lines = body.errors.map((item) => `line ${item.line}: ${item.message}`).join("; ");
    throw Object.assign(new Error(`${error.message}: ${lines}`), { field: "code" });
  }
  if (body?.unboundSlots?.length) throw Object.assign(new Error(error.message), { field: "isActive" });
  throw new Error(error.message);
}

function rangeQuery(pagination: RangePagination | undefined) {
  return { query: JSON.stringify(pagination ? { pagination } : {}) };
}

/** Fetches one window of the user's notification models, newest first. */
export function listNotificationModels(pagination?: RangePagination) {
  return apiRequest<NotificationPage<NotificationModelSummary>>("/notification-models", {
    query: rangeQuery(pagination)
  });
}

/** Fetches one model with its endpoint path, update info and pending run counts. */
export function getNotificationModel(id: string) {
  return apiRequest<{ model: NotificationModel }>(`/notification-models/${id}`);
}

/** Creates a model; a rejected save carries the script errors by line. */
export function createNotificationModel(body: NotificationModelBody & { name: string }) {
  return apiRequest<{ model: NotificationModel }>("/notification-models", { method: "POST", body }).catch(toSaveError);
}

/** Updates a model; any subset of fields may be sent. A rejected save carries the script errors by line or the unbound slots. */
export function updateNotificationModel(id: string, body: NotificationModelBody) {
  return apiRequest<{ model: NotificationModel }>(`/notification-models/${id}`, { method: "PUT", body }).catch(toSaveError);
}

/** Deletes a model together with its queue and logs. */
export function deleteNotificationModel(id: string) {
  return apiRequest<void>(`/notification-models/${id}`, { method: "DELETE" });
}

/** Checks script syntax and helper use without saving. */
export function validateNotificationCode(code: string) {
  return apiRequest<{ errors: NotificationCodeError[] }>("/notification-models/validate", {
    method: "POST",
    body: { code }
  });
}

/** Runs sample text through the model, optionally with unsaved `code` and `settings`; creates nothing. */
export function testNotificationModel(id: string, body: { text: string; code?: string; settings?: Record<string, string> }) {
  return apiRequest<NotificationTestResult>(`/notification-models/${id}/test`, { method: "POST", body });
}

/** Fetches one window of the model's queued and processing runs, oldest first. */
export function listNotificationQueue(id: string, pagination?: RangePagination) {
  return apiRequest<NotificationPage<NotificationRun>>(`/notification-models/${id}/queue`, {
    query: rangeQuery(pagination)
  });
}

/** Fetches one window of the model's finished runs, newest first. */
export function listNotificationLogs(id: string, pagination?: RangePagination) {
  return apiRequest<NotificationPage<NotificationRun>>(`/notification-models/${id}/logs`, {
    query: rangeQuery(pagination)
  });
}

/** Publishes the model to the library as its next version. */
export function publishNotificationModel(id: string) {
  return apiRequest<{ model: NotificationModel; version: { id: string; version: number } }>(`/notification-models/${id}/publish`, { method: "POST" });
}

/** Unpublishes a model: hides it from the library; its versions and installed copies are kept. */
export function unpublishNotificationModel(id: string) {
  return updateNotificationModel(id, { visibility: "private" });
}

/** Resolves a model's `endpointPath` against the API base URL, giving the full ingest URL. */
export function notificationEndpointUrl(endpointPath: string) {
  return apiUrl(endpointPath);
}

/** Lists public library models with their latest version (no code). */
export function listNotificationLibrary() {
  return apiRequest<{ data: NotificationLibraryEntry[] }>("/notification-library");
}

/** Reads one library model's latest version including its code. */
export function getNotificationLibraryEntry(modelId: string) {
  return apiRequest<{ entry: NotificationLibraryEntry }>(`/notification-library/${modelId}`);
}

/** Installs a library model as the caller's private, inactive copy. */
export function installNotificationModel(modelId: string) {
  return apiRequest<{ model: NotificationModel }>(`/notification-library/${modelId}/install`, { method: "POST" });
}

/** Applies library version `versionId` to a copy; `bindings` supplies records for new required slots. */
export function updateNotificationModelFromSource(id: string, body: { versionId: string; bindings?: Record<string, string> }) {
  return apiRequest<{ model: NotificationModel }>(`/notification-models/${id}/update-from-source`, { method: "POST", body });
}
