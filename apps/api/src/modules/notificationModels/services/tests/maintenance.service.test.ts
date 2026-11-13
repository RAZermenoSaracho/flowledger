import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { applyRetention, failLostRuns } from "../maintenance.service.js";

const now = new Date("2026-06-01T12:00:00Z");
const terminal = { in: ["completed", "skipped", "failed"] };

describe("failLostRuns", () => {
  it("fails processing runs of workers not seen within 2 minutes and prunes old worker rows", async () => {
    prismaMock.notificationWorker.findMany.mockResolvedValue([{ id: "w1" }] as never);
    prismaMock.notificationRun.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.notificationWorker.deleteMany.mockResolvedValue({ count: 0 });

    await expect(failLostRuns(now)).resolves.toBe(2);

    expect(prismaMock.notificationWorker.findMany.mock.calls[0]![0]!.where).toEqual({
      lastSeenAt: { gte: new Date(now.getTime() - 120_000) }
    });
    expect(prismaMock.notificationRun.updateMany).toHaveBeenCalledWith({
      where: { status: "processing", workerId: { notIn: ["w1"] } },
      data: { status: "failed", reason: "worker_lost", finishedAt: now }
    });
    expect(prismaMock.notificationWorker.deleteMany).toHaveBeenCalledWith({
      where: { lastSeenAt: { lt: new Date(now.getTime() - 3_600_000) } }
    });
  });
});

describe("applyRetention", () => {
  it("nulls text after 7 days and deletes after 30, only for terminal runs", async () => {
    prismaMock.notificationRun.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.notificationRun.deleteMany.mockResolvedValue({ count: 0 });

    await applyRetention(now);

    expect(prismaMock.notificationRun.updateMany).toHaveBeenCalledWith({
      where: { status: terminal, finishedAt: { lt: new Date(now.getTime() - 7 * 86_400_000) }, text: { not: null } },
      data: { text: null }
    });
    expect(prismaMock.notificationRun.deleteMany).toHaveBeenCalledWith({
      where: { status: terminal, finishedAt: { lt: new Date(now.getTime() - 30 * 86_400_000) } }
    });
    const statuses = JSON.stringify(prismaMock.notificationRun.updateMany.mock.calls[0]![0]);
    expect(statuses).not.toMatch(/queued|processing/);
  });
});
