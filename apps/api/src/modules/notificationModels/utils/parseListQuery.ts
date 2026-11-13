import { badRequest } from "../../../utils/httpError.js";
import type { NotificationListQueryInput } from "../types/notificationModels.types.js";

/** Decodes the raw `query` request param (a JSON object holding `where`/`sort`/`pagination`); `{}` when absent, 400 when malformed. */
export function parseListQuery(raw: string | undefined): NotificationListQueryInput {
  if (!raw) return {};

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw badRequest("Invalid query: not valid JSON");
  }
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    throw badRequest("Invalid query: must be a JSON object");
  }
  return decoded as NotificationListQueryInput;
}
