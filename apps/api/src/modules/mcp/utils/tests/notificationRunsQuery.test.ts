import { describe, expect, it } from "vitest";
import { notificationQueueToolSchema, notificationLogsToolSchema } from "@flowledger/shared";
import { buildNotificationRunsQuery } from "../notificationRunsQuery.js";

describe("buildNotificationRunsQuery", () => {
  it("emits default pagination without where or sort", () => {
    expect(JSON.parse(buildNotificationRunsQuery(notificationQueueToolSchema.parse({ id: "m" })))).toEqual({
      pagination: { kind: "offset", page: 1, pageSize: 50 }
    });
  });

  it("compiles inclusive from, next-day exclusive to, status and custom pagination", () => {
    expect(JSON.parse(buildNotificationRunsQuery(notificationLogsToolSchema.parse({
      id: "m", receivedFrom: "2026-01-01", receivedTo: "2026-01-31", status: "failed", page: 2, pageSize: 10
    })))).toEqual({
      where: { and: [
        { field: "receivedAt", op: ">=", value: "2026-01-01T00:00:00.000Z" },
        { field: "receivedAt", op: "<", value: "2026-02-01T00:00:00.000Z" },
        { field: "status", op: "=", value: "failed" }
      ] },
      pagination: { kind: "offset", page: 2, pageSize: 10 }
    });
  });

  it("normalizes datetime bounds to UTC without extending the upper bound", () => {
    const query = JSON.parse(buildNotificationRunsQuery(notificationQueueToolSchema.parse({
      id: "m", receivedFrom: "2026-01-01T00:00:00-06:00", receivedTo: "2026-01-02T00:00:00-06:00"
    })));
    expect(query.where.and).toEqual([
      { field: "receivedAt", op: ">=", value: "2026-01-01T06:00:00.000Z" },
      { field: "receivedAt", op: "<", value: "2026-01-02T06:00:00.000Z" }
    ]);
  });
});
