import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../config/env.js";
import { prismaMock } from "../../../tests/helpers/prismaMock.js";

const claimNextRun = vi.fn();
const processRun = vi.fn();
const failLostRuns = vi.fn();
const applyRetention = vi.fn();
vi.mock("../services/claim.service.js", () => ({ claimNextRun }));
vi.mock("../services/processRun.service.js", () => ({ processRun }));
vi.mock("../services/maintenance.service.js", () => ({ failLostRuns, applyRetention }));

const { NotificationRunWorker } = await import("../notificationRunWorker.js");

const abortError = () => new DOMException("Aborted", "AbortError");

beforeEach(() => {
  vi.useFakeTimers();
  (env as { NOTIFICATION_PROCESSOR_MAX_CONCURRENT_GLOBAL: number }).NOTIFICATION_PROCESSOR_MAX_CONCURRENT_GLOBAL = 2;
  prismaMock.notificationWorker.create.mockResolvedValue({} as never);
  prismaMock.notificationWorker.updateMany.mockResolvedValue({ count: 1 } as never);
  prismaMock.notificationWorker.deleteMany.mockResolvedValue({ count: 1 } as never);
  prismaMock.notificationRun.updateMany.mockResolvedValue({ count: 1 } as never);
});
afterEach(() => vi.useRealTimers());

describe("NotificationRunWorker", () => {
  it("registers its row and runs maintenance at start", async () => {
    const w = new NotificationRunWorker();
    claimNextRun.mockResolvedValue(null);
    await w.start();
    expect(prismaMock.notificationWorker.create.mock.calls[0]![0]!.data).toMatchObject({ id: w.workerId, pid: process.pid });
    expect(failLostRuns).toHaveBeenCalledTimes(1);
    expect(applyRetention).toHaveBeenCalledTimes(1);
    await w.stop();
  });

  it("claims at most the global limit in flight", async () => {
    const w = new NotificationRunWorker();
    claimNextRun.mockImplementation(async () => ({ id: `r${claimNextRun.mock.calls.length}` }));
    processRun.mockReturnValue(new Promise(() => {}));
    await w.tick();
    expect(claimNextRun).toHaveBeenCalledTimes(2);
    expect(processRun).toHaveBeenCalledTimes(2);
  });

  it("touches lastSeenAt every 15 s and runs maintenance every minute", async () => {
    const w = new NotificationRunWorker();
    claimNextRun.mockResolvedValue(null);
    await w.start();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(prismaMock.notificationWorker.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.notificationWorker.updateMany.mock.calls[0]![0]).toMatchObject({ where: { id: w.workerId } });
    await vi.advanceTimersByTimeAsync(45_000);
    expect(failLostRuns).toHaveBeenCalledTimes(2);
    expect(applyRetention).toHaveBeenCalledTimes(2);
    await w.stop();
  });

  it("stop aborts sandbox runs and returns them to queued guarded by workerId, then deletes its row", async () => {
    const w = new NotificationRunWorker();
    claimNextRun.mockResolvedValueOnce({ id: "r1" }).mockResolvedValue(null);
    processRun.mockImplementation(
      (_run, { signal }: { signal: AbortSignal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(abortError())))
    );
    await w.tick();
    await w.stop();
    expect(prismaMock.notificationRun.updateMany.mock.calls[0]![0]).toEqual({
      where: { id: "r1", status: "processing", workerId: w.workerId },
      data: { status: "queued", workerId: null, startedAt: null }
    });
    expect(prismaMock.notificationWorker.deleteMany).toHaveBeenCalledWith({ where: { id: w.workerId } });
    claimNextRun.mockClear();
    await w.tick();
    expect(claimNextRun).not.toHaveBeenCalled();
  });

  it("stop lets a run past its sandbox (create step) finish and never requeues it", async () => {
    const w = new NotificationRunWorker();
    claimNextRun.mockResolvedValueOnce({ id: "r1" }).mockResolvedValue(null);
    let finish!: () => void;
    processRun.mockReturnValue(new Promise<string>((resolve) => (finish = () => resolve("completed"))));
    await w.tick();
    const stopping = w.stop();
    finish();
    await stopping;
    expect(prismaMock.notificationRun.updateMany).not.toHaveBeenCalled();
  });

  it("stop resolves within 10 s even when a run hangs, leaving it processing", async () => {
    const w = new NotificationRunWorker();
    claimNextRun.mockResolvedValueOnce({ id: "r1" }).mockResolvedValue(null);
    processRun.mockReturnValue(new Promise(() => {}));
    await w.tick();
    const stopping = w.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    await stopping;
    expect(prismaMock.notificationRun.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.notificationWorker.deleteMany).toHaveBeenCalled();
  });
});
