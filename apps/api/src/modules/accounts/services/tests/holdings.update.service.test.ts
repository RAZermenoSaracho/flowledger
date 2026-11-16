import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../holdings.read.service.js", () => ({ getAccountHoldings: vi.fn() }));

const { getAccountHoldings } = await import("../holdings.read.service.js");
const { applyHoldingChanges } = await import("../holdings.update.service.js");

const body = { accountId: "acc-1", holdings: [], valuation: {} } as never;
const dec = (value: string) => new Prisma.Decimal(value);

function stored(id: string, extra: Record<string, unknown> = {}) {
  return { id, kind: "crypto", code: "BTC", manualUnitPrice: null, ...extra };
}

beforeEach(() => {
  vi.mocked(getAccountHoldings).mockResolvedValue(body);
  prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "crypto" } as never);
  prismaMock.holding.findMany.mockResolvedValue([]);
});

const apply = (changeSet: Record<string, unknown>) =>
  applyHoldingChanges("user-1", "acc-1", { upsert: [], remove: [], ...changeSet } as never);

describe("applyHoldingChanges", () => {
  it("creates, updates and removes inside one transaction and returns the GET body", async () => {
    prismaMock.holding.findMany.mockResolvedValue([stored("h1"), stored("h2")] as never);

    const result = await apply({
      upsert: [{ kind: "fiat", code: "USD", quantity: "250.50" }, { id: "h1", quantity: "2" }],
      remove: ["h2"]
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "acc-1", userId: "user-1" } })
    );
    expect(prismaMock.holding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["h1", "h2"] }, accountId: "acc-1", userId: "user-1" } })
    );
    expect(prismaMock.holding.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["h2"] }, accountId: "acc-1", userId: "user-1" }
    });
    expect(prismaMock.holding.create).toHaveBeenCalledWith({
      data: { userId: "user-1", accountId: "acc-1", kind: "fiat", code: "USD", quantity: dec("250.50") }
    });
    expect(prismaMock.holding.update).toHaveBeenCalledWith({
      where: { id: "h1", accountId: "acc-1", userId: "user-1" },
      data: { quantity: dec("2") }
    });
    expect(result).toBe(body);
  });

  it("404s for a missing account and 400s for an ineligible type, writing nothing", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);
    await expect(apply({ remove: ["h1"] })).rejects.toMatchObject({ statusCode: 404 });

    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "checking" } as never);
    await expect(apply({ upsert: [{ kind: "fiat", code: "USD", quantity: "1" }] })).rejects.toMatchObject({
      statusCode: 400
    });
    expect(prismaMock.holding.create).not.toHaveBeenCalled();
  });

  it("404s for a holding id from another account or user (not found under accountId+userId) and writes nothing", async () => {
    prismaMock.holding.findMany.mockResolvedValue([stored("h1")] as never);
    await expect(apply({ upsert: [{ id: "h1", quantity: "1" }], remove: ["foreign"] })).rejects.toMatchObject({
      statusCode: 404
    });
    expect(prismaMock.holding.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.holding.update).not.toHaveBeenCalled();
  });

  it("rejects creates beyond 200 holdings per account, counting removals, and writes nothing", async () => {
    prismaMock.holding.count.mockResolvedValue(200);
    await expect(apply({ upsert: [{ kind: "crypto", code: "ETH", quantity: "1" }] })).rejects.toMatchObject({
      statusCode: 400
    });
    expect(prismaMock.holding.count).toHaveBeenCalledWith({ where: { accountId: "acc-1", userId: "user-1" } });
    expect(prismaMock.holding.create).not.toHaveBeenCalled();

    prismaMock.holding.findMany.mockResolvedValue([stored("h1")] as never);
    await apply({ upsert: [{ kind: "crypto", code: "ETH", quantity: "1" }], remove: ["h1", "h1"] });
    expect(prismaMock.holding.create).toHaveBeenCalledTimes(1);
  });

  it("rejects the same id updated and removed", async () => {
    await expect(apply({ upsert: [{ id: "h1", quantity: "1" }], remove: ["h1"] })).rejects.toMatchObject({
      statusCode: 400
    });
  });

  it("maps a unique violation to a 400 with a clear message", async () => {
    prismaMock.holding.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" })
    );
    await expect(apply({ upsert: [{ kind: "crypto", code: "BTC", quantity: "1" }] })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("only once")
    });
  });

  it("propagates a mid-change failure out of the transaction so nothing is committed", async () => {
    prismaMock.holding.findMany.mockResolvedValue([stored("h1", { kind: "fiat", code: "USD" })] as never);
    await expect(
      apply({
        upsert: [{ kind: "crypto", code: "ETH", quantity: "1" }, { id: "h1", quantity: "10.005" }]
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(getAccountHoldings).not.toHaveBeenCalled();
  });

  it("re-checks fiat precision and manual price against the stored kind and code", async () => {
    prismaMock.holding.findMany.mockResolvedValue([stored("h1", { kind: "fiat", code: "USD" })] as never);
    await expect(apply({ upsert: [{ id: "h1", quantity: "10.005" }] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      apply({ upsert: [{ id: "h1", manualUnitPrice: "2", manualPriceCurrency: "USD" }] })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("sets manualPricedAt to the supplied or current time when the price or currency changes", async () => {
    prismaMock.holding.findMany.mockResolvedValue([stored("h1"), stored("h2")] as never);
    const at = new Date("2025-06-01T00:00:00Z");
    await apply({
      upsert: [
        { id: "h1", manualUnitPrice: "55000", manualPriceCurrency: "USD", manualPricedAt: at },
        { id: "h2", manualUnitPrice: "1", manualPriceCurrency: "USD" }
      ]
    });
    const [first, second] = prismaMock.holding.update.mock.calls.map((call) => call[0].data);
    expect(first).toEqual({ manualUnitPrice: dec("55000"), manualPriceCurrency: "USD", manualPricedAt: at });
    expect(second!.manualPricedAt).toBeInstanceOf(Date);
  });

  it("keeps manualPricedAt on a quantity-only edit and clears the whole override with manualUnitPrice null", async () => {
    prismaMock.holding.findMany.mockResolvedValue([stored("h1"), stored("h2")] as never);
    await apply({ upsert: [{ id: "h1", quantity: "3" }, { id: "h2", manualUnitPrice: null }] });
    const [qtyOnly, cleared] = prismaMock.holding.update.mock.calls.map((call) => call[0].data);
    expect(qtyOnly).toEqual({ quantity: dec("3") });
    expect(cleared).toEqual({ manualUnitPrice: null, manualPriceCurrency: null, manualPricedAt: null });
  });

  it("stores a manual price given on create with a default time", async () => {
    await apply({
      upsert: [{ kind: "crypto", code: "BTC", quantity: "1", manualUnitPrice: "9", manualPriceCurrency: "EUR" }]
    });
    const data = prismaMock.holding.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ manualUnitPrice: dec("9"), manualPriceCurrency: "EUR" });
    expect(data.manualPricedAt).toBeInstanceOf(Date);
  });
});
