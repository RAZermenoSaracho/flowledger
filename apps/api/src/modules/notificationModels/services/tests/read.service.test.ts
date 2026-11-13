import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../../../db/sieve.js", () => ({ createSieve: () => ({ query }) }));

const {
  assertBindingsValid,
  countLiveWorkers,
  getModelById,
  getOwnedModel,
  listLogs,
  listModels,
  listQueue,
  resolveBindingNames
} = await import("../read.service.js");

const slots = [
  { key: "card", kind: "account" as const, label: "Card", required: true },
  { key: "general", kind: "category" as const, label: "General", required: false },
  { key: "trip", kind: "group" as const, label: "Trip", required: false }
];

/** `groupBy`'s overloaded generics defeat `vitest-mock-extended` typing, so it is narrowed to a plain mock. */
const groupByMock = prismaMock.notificationRun.groupBy as unknown as { mockResolvedValue: (value: unknown) => void };

beforeEach(() => query.mockReset());

describe("getOwnedModel", () => {
  it("scopes by id and userId and 404s otherwise", async () => {
    prismaMock.notificationModel.findFirst.mockResolvedValue(null);
    await expect(getOwnedModel("u1", "m1")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.notificationModel.findFirst).toHaveBeenCalledWith({ where: { id: "m1", userId: "u1" } });
  });
});

describe("assertBindingsValid", () => {
  it("queries only the caller's non-archived records", async () => {
    prismaMock.account.findMany.mockResolvedValue([{ id: "a1" }] as never);
    prismaMock.category.findMany.mockResolvedValue([{ id: "c1" }] as never);
    prismaMock.group.findMany.mockResolvedValue([{ id: "g1" }] as never);

    await expect(assertBindingsValid("u1", slots, { card: "a1", general: "c1", trip: "g1" })).resolves.toBeUndefined();
    expect(prismaMock.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["a1"] }, userId: "u1", isArchived: false } })
    );
    expect(prismaMock.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["c1"] }, isArchived: false, users: { some: { userId: "u1" } } } })
    );
    expect(prismaMock.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["g1"] }, isArchived: false, members: { some: { userId: "u1" } } } })
    );
  });

  it("rejects foreign/archived records and undeclared keys with the slot keys", async () => {
    prismaMock.account.findMany.mockResolvedValue([]);
    prismaMock.category.findMany.mockResolvedValue([]);
    prismaMock.group.findMany.mockResolvedValue([]);

    await expect(assertBindingsValid("u1", slots, { card: "foreign", ghost: "x" })).rejects.toMatchObject({
      statusCode: 400,
      details: { invalidBindings: ["card", "ghost"] }
    });
  });
});

describe("resolveBindingNames", () => {
  it("maps slot keys to record names", async () => {
    prismaMock.account.findMany.mockResolvedValue([{ id: "a1", name: "Plata" }] as never);
    prismaMock.category.findMany.mockResolvedValue([]);
    prismaMock.group.findMany.mockResolvedValue([]);
    expect(await resolveBindingNames("u1", slots, { card: "a1", general: "gone" })).toEqual({ card: "Plata" });
  });
});

describe("listModels", () => {
  it("scopes to the caller, paginates by default and adds endpointPath and lastRunStatus", async () => {
    query.mockResolvedValue({ data: [{ id: "m1" }], meta: { total: 1 } });
    prismaMock.notificationRun.findMany.mockResolvedValue([{ modelId: "m1", status: "failed" }] as never);

    const result = await listModels("u1", undefined);

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { field: "userId", op: "=", value: "u1" },
        pagination: { kind: "offset", page: 1, pageSize: 50 }
      })
    );
    expect(result.data).toEqual([
      { id: "m1", endpointPath: "/v1/notification-models/m1/notifications", lastRunStatus: "failed" }
    ]);
  });

  it("ands a caller filter with the user scope", async () => {
    query.mockResolvedValue({ data: [], meta: {} });
    prismaMock.notificationRun.findMany.mockResolvedValue([]);
    const filter = { field: "isActive", op: "=", value: true };
    await listModels("u1", JSON.stringify({ where: filter }));
    expect(query.mock.calls[0]![0].where).toEqual({ and: [{ field: "userId", op: "=", value: "u1" }, filter] });
  });
});

describe("getModelById", () => {
  const base = { id: "m1", userId: "u1", code: "x", sourceVersionId: null };

  it("includes endpointPath, counts, last run status and a neutral update block", async () => {
    prismaMock.notificationModel.findFirst.mockResolvedValue(base as never);
    groupByMock.mockResolvedValue([{ status: "queued", _count: { _all: 3 } }] as never);
    prismaMock.notificationRun.findFirst.mockResolvedValue({ status: "completed" } as never);

    expect(await getModelById("u1", "m1")).toMatchObject({
      endpointPath: "/v1/notification-models/m1/notifications",
      queued: 3,
      processing: 0,
      lastRunStatus: "completed",
      update: { available: false, installedVersion: null, latestVersion: null, localCodeModified: false }
    });
  });

  it("reports an available update and local modification", async () => {
    prismaMock.notificationModel.findFirst.mockResolvedValue({ ...base, sourceVersionId: "v1" } as never);
    groupByMock.mockResolvedValue([] as never);
    prismaMock.notificationRun.findFirst.mockResolvedValue(null);
    prismaMock.notificationModelVersion.findUnique.mockResolvedValue({ id: "v1", modelId: "src", version: 1, code: "orig" } as never);
    prismaMock.notificationModelVersion.findFirst.mockResolvedValue({ version: 2 } as never);

    expect((await getModelById("u1", "m1")).update).toEqual({
      available: true,
      installedVersion: 1,
      latestVersion: 2,
      localCodeModified: true
    });
  });
});

describe("listQueue / listLogs", () => {
  it("404s for a foreign model without querying runs", async () => {
    prismaMock.notificationModel.findFirst.mockResolvedValue(null);
    await expect(listQueue("u1", "m1", undefined)).rejects.toMatchObject({ statusCode: 404 });
    await expect(listLogs("u1", "m1", undefined)).rejects.toMatchObject({ statusCode: 404 });
    expect(query).not.toHaveBeenCalled();
  });

  it("queue: oldest first, queued+processing, text cut to 80 chars, internals hidden", async () => {
    prismaMock.notificationModel.findFirst.mockResolvedValue({ id: "m1" } as never);
    query.mockResolvedValue({
      data: [{ id: "r1", text: "x".repeat(200), dedupeKey: "k", workerId: "w" }, { id: "r2", text: null, dedupeKey: "k2", workerId: null }],
      meta: {}
    });

    const result = await listQueue("u1", "m1", undefined);

    const arg = query.mock.calls[0]![0];
    expect(arg.sort).toEqual([{ field: "receivedAt", direction: "asc" }]);
    expect(arg.where.and).toContainEqual({ field: "status", op: "in", value: ["queued", "processing"] });
    expect(arg.where.and).toContainEqual({ field: "userId", op: "=", value: "u1" });
    expect(result.data).toEqual([{ id: "r1", text: "x".repeat(80) }, { id: "r2", text: null }]);
  });

  it("logs: newest first, terminal statuses, text kept as stored", async () => {
    prismaMock.notificationModel.findFirst.mockResolvedValue({ id: "m1" } as never);
    query.mockResolvedValue({ data: [{ id: "r1", text: "full text", dedupeKey: "k", workerId: "w" }], meta: {} });

    const result = await listLogs("u1", "m1", undefined);

    const arg = query.mock.calls[0]![0];
    expect(arg.sort).toEqual([{ field: "finishedAt", direction: "desc" }]);
    expect(arg.where.and).toContainEqual({ field: "status", op: "in", value: ["completed", "skipped", "failed"] });
    expect(result.data).toEqual([{ id: "r1", text: "full text" }]);
  });
});

describe("countLiveWorkers", () => {
  it("counts workers seen within 60 seconds", async () => {
    prismaMock.notificationWorker.count.mockResolvedValue(2);
    const now = new Date("2026-01-01T00:01:00.000Z");
    expect(await countLiveWorkers(now)).toBe(2);
    expect(prismaMock.notificationWorker.count).toHaveBeenCalledWith({
      where: { lastSeenAt: { gte: new Date("2026-01-01T00:00:00.000Z") } }
    });
  });
});
