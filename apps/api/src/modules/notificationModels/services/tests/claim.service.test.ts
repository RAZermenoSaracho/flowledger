import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, type Mock } from "vitest";
import { env } from "../../../../config/env.js";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { claimNextRun } from "../claim.service.js";

const t = (n: number) => new Date(2026, 0, 1, 0, n);
const proc = (...rows: Array<[string, string]>) => {
  // rows: [userId, modelId] per processing run
  const by = (key: 0 | 1, name: "userId" | "modelId") => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r[key], (m.get(r[key]) ?? 0) + 1));
    return [...m].map(([k, n]) => ({ [name]: k, _count: { _all: n } }));
  };
  return [by(0, "userId"), by(1, "modelId")];
};
const head = (userId: string, modelId: string, n: number) => ({ userId, modelId, _min: { receivedAt: t(n) } });

function setup(processing: Array<[string, string]>, heads: ReturnType<typeof head>[]) {
  const [byUser, byModel] = proc(...processing);
  const groupBy = prismaMock.notificationRun.groupBy as unknown as Mock;
  groupBy.mockResolvedValueOnce(byUser).mockResolvedValueOnce(byModel).mockResolvedValueOnce(heads);
  prismaMock.notificationRun.findFirst.mockResolvedValue({ id: "r1" } as never);
  prismaMock.notificationRun.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.notificationRun.findUnique.mockResolvedValue({ id: "r1", status: "processing" } as never);
}

const chosenModel = () => prismaMock.notificationRun.findFirst.mock.calls[0]![0]!.where!.modelId;

beforeEach(() => {
  (env as { NOTIFICATION_PROCESSOR_MAX_CONCURRENT_GLOBAL: number }).NOTIFICATION_PROCESSOR_MAX_CONCURRENT_GLOBAL = 4;
  (env as { NOTIFICATION_PROCESSOR_MAX_CONCURRENT_PER_USER: number }).NOTIFICATION_PROCESSOR_MAX_CONCURRENT_PER_USER = 2;
});

describe("claimNextRun", () => {
  it("claims with a guarded update inside a Serializable transaction", async () => {
    setup([], [head("a", "m1", 1)]);

    await expect(claimNextRun("w1")).resolves.toEqual({ id: "r1", status: "processing" });

    expect(prismaMock.$transaction.mock.calls[0]![1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    });
    expect(prismaMock.notificationRun.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", status: "queued" },
      data: { status: "processing", workerId: "w1", startedAt: expect.any(Date) }
    });
  });

  it("returns null at the global limit without looking at the queue", async () => {
    setup([["a", "m1"], ["a", "m1"], ["b", "m2"], ["c", "m3"]], [head("d", "m4", 1)]);

    await expect(claimNextRun("w1")).resolves.toBeNull();
    expect(prismaMock.notificationRun.groupBy).toHaveBeenCalledTimes(2);
    expect(prismaMock.notificationRun.updateMany).not.toHaveBeenCalled();
  });

  it("skips users at the per-user limit", async () => {
    setup([["a", "m1"], ["a", "m1"]], [head("a", "m1", 1), head("b", "m2", 5)]);

    await claimNextRun("w1");
    expect(chosenModel()).toBe("m2");
  });

  it("returns null when every queued user is at the per-user limit", async () => {
    setup([["a", "m1"], ["a", "m1"]], [head("a", "m1", 1)]);

    await expect(claimNextRun("w1")).resolves.toBeNull();
  });

  it("prefers a user with 0 running over an older backlogged user", async () => {
    setup([["a", "m1"]], [head("a", "m1", 1), head("b", "m2", 9)]);

    await claimNextRun("w1");
    expect(chosenModel()).toBe("m2");
  });

  it("prefers a model with 0 running within one user", async () => {
    setup([["a", "m1"]], [head("a", "m1", 1), head("a", "m2", 9)]);

    await claimNextRun("w1");
    expect(chosenModel()).toBe("m2");
  });

  it("breaks ties by oldest head and takes the oldest run in the model", async () => {
    setup([], [head("a", "m1", 7), head("b", "m2", 3)]);

    await claimNextRun("w1");
    expect(chosenModel()).toBe("m2");
    expect(prismaMock.notificationRun.findFirst.mock.calls[0]![0]).toMatchObject({
      where: { modelId: "m2", status: "queued" },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }]
    });
  });

  it("returns null when the guarded update loses the race", async () => {
    setup([], [head("a", "m1", 1)]);
    prismaMock.notificationRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(claimNextRun("w1")).resolves.toBeNull();
  });

  it("retries P2034 and succeeds", async () => {
    setup([], [head("a", "m1", 1)]);
    const err = new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "x" });
    const real = prismaMock.$transaction.getMockImplementation()!;
    prismaMock.$transaction.mockRejectedValueOnce(err).mockRejectedValueOnce(err).mockImplementation(real);

    await expect(claimNextRun("w1")).resolves.toMatchObject({ id: "r1" });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);
  });

  it("gives up with null after 3 P2034 failures and rethrows other errors", async () => {
    const err = new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "x" });
    prismaMock.$transaction.mockRejectedValue(err);
    await expect(claimNextRun("w1")).resolves.toBeNull();
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);

    prismaMock.$transaction.mockReset();
    prismaMock.$transaction.mockRejectedValue(new Error("boom"));
    await expect(claimNextRun("w1")).rejects.toThrow("boom");
  });
});
