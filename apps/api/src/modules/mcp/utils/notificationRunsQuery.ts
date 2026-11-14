import type { z } from "zod";
import type { notificationQueueToolSchema, notificationLogsToolSchema } from "@flowledger/shared";
import { exclusiveDateRangeEnd } from "../../../utils/dateRange.js";

/** Compiles received-date and status filters to DSQL; the read service owns ordering and model/user scope. */
export function buildNotificationRunsQuery(
  filter: z.infer<typeof notificationQueueToolSchema> | z.infer<typeof notificationLogsToolSchema>
): string {
  const conditions: unknown[] = [];
  if (filter.receivedFrom) {
    conditions.push({ field: "receivedAt", op: ">=", value: new Date(filter.receivedFrom).toISOString() });
  }
  if (filter.receivedTo) {
    conditions.push({ field: "receivedAt", op: "<", value: exclusiveDateRangeEnd(filter.receivedTo).toISOString() });
  }
  if (filter.status) conditions.push({ field: "status", op: "=", value: filter.status });
  return JSON.stringify({
    ...(conditions.length ? { where: { and: conditions } } : {}),
    pagination: { kind: "offset", page: filter.page, pageSize: filter.pageSize }
  });
}
