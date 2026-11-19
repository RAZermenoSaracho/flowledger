import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../holdings.read.service.js", () => ({ getAccountHoldings: vi.fn() }));
vi.mock("../../../currencies/providers/twelveData/services/quotes.service.js", () => ({ refreshSecurityQuotes: vi.fn() }));

const { getAccountHoldings } = await import("../holdings.read.service.js");
const { refreshSecurityQuotes } = await import("../../../currencies/providers/twelveData/services/quotes.service.js");
const { applyHoldingChanges, refreshAccountHoldings } = await import("../holdings.update.service.js");

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
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "investment" } as never);
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
      data: { userId: "user-1", accountId: "acc-1", kind: "fiat", code: "USD", name: null, unit: null, exchange: null, quoteCurrency: null, quantity: dec("250.50") }
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

  const p2002 = () => new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" });
  const linkedAapl = { kind: "stock", code: "AAPL", exchange: "XNGS", quoteCurrency: "USD", quantity: "1" };

  it("maps a unique violation to a 409 duplicate_holding naming the instrument", async () => {
    prismaMock.holding.create.mockRejectedValue(p2002());
    prismaMock.holding.findMany.mockResolvedValue([{ kind: "crypto", code: "BTC", exchange: null }] as never);
    await expect(apply({ upsert: [{ kind: "crypto", code: "BTC", quantity: "1" }] })).rejects.toMatchObject({
      statusCode: 409,
      message: "This account already contains a holding for BTC. Edit the existing holding instead.",
      details: {
        code: "duplicate_holding",
        holding: { kind: "crypto", code: "BTC", exchange: null },
        issues: { formErrors: [], fieldErrors: { "upsert.0.code": [expect.stringContaining("BTC")] } }
      }
    });
  });

  it("on a unique violation blames the create the account now holds", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "investment" } as never);
    prismaMock.holding.create.mockRejectedValue(p2002());
    prismaMock.holding.findMany.mockResolvedValue([{ kind: "crypto", code: "ETH", exchange: null }] as never);
    await expect(
      apply({ upsert: [{ kind: "crypto", code: "BTC", quantity: "1" }, { kind: "crypto", code: "ETH", quantity: "1" }] })
    ).rejects.toMatchObject({
      statusCode: 409,
      details: { holding: { kind: "crypto", code: "ETH", exchange: null }, issues: { fieldErrors: { "upsert.1.code": expect.any(Array) } } }
    });
  });

  it("pre-checks a linked create and 409s naming the listing with its exchange", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "investment" } as never);
    prismaMock.holding.findFirst.mockResolvedValue({ id: "h1" } as never);
    await expect(apply({ upsert: [linkedAapl] })).rejects.toMatchObject({
      statusCode: 409,
      message: "This account already contains a holding for AAPL (XNGS). Edit the existing holding instead.",
      details: { code: "duplicate_holding", holding: { kind: "stock", code: "AAPL", exchange: "XNGS" } }
    });
    expect(prismaMock.holding.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: "acc-1", userId: "user-1", kind: "stock", code: "AAPL", exchange: "XNGS" } })
    );
    expect(prismaMock.holding.create).not.toHaveBeenCalled();
  });

  it("propagates a mid-change failure out of the transaction so nothing is committed", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "investment" } as never);
    prismaMock.holding.findMany.mockResolvedValue([stored("h1", { kind: "fiat", code: "USD" })] as never);
    await expect(
      apply({
        upsert: [{ kind: "crypto", code: "ETH", quantity: "1" }, { id: "h1", quantity: "10.005" }]
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(getAccountHoldings).not.toHaveBeenCalled();
  });

  it("re-checks fiat precision and manual price against the stored kind and code", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "investment" } as never);
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

describe("holding kind rules", () => {
  it.each(["fiat", "stock"])("rejects %s creates in crypto accounts before writing", async (kind) => {
    await expect(apply({ upsert: [{ kind, code: "USD", quantity: "1" }] })).rejects.toMatchObject({ statusCode: 400, details: { issues: { fieldErrors: { kind: [expect.any(String)] } } } });
    expect(prismaMock.holding.create).not.toHaveBeenCalled();
    expect(prismaMock.holding.update).not.toHaveBeenCalled();
    expect(prismaMock.holding.deleteMany).not.toHaveBeenCalled();
  });

  it.each(["crypto", "fiat", "stock", "etf", "other"])("creates investment kind %s", async (kind) => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "investment" } as never);
    await apply({ upsert: [{ kind, ...(kind === "other" ? { name: "Gold", unit: "oz" } : { code: kind === "fiat" ? "USD" : "BTC" }), quantity: "1", ...(kind !== "fiat" ? { manualUnitPrice: "2", manualPriceCurrency: "EUR" } : {}) }] });
    expect(prismaMock.holding.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind, ...(kind === "other" ? { code: null, name: "Gold", unit: "oz" } : {}) }) }));
  });

  it("rejects incompatible stored updates but allows removal", async () => {
    prismaMock.holding.findMany.mockResolvedValue([stored("h1", { kind: "fiat", code: "USD" })] as never);
    await expect(apply({ upsert: [{ id: "h1", quantity: "2" }] })).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.holding.update).not.toHaveBeenCalled();
    await apply({ remove: ["h1"] });
    expect(prismaMock.holding.deleteMany).toHaveBeenCalledTimes(1);
  });

  it.each(["stock", "etf", "other"])("rejects clearing the manual price on %s", async (kind) => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "investment" } as never);
    prismaMock.holding.findMany.mockResolvedValue([stored("h1", { kind, manualUnitPrice: dec("1") })] as never);
    await expect(apply({ upsert: [{ id: "h1", manualUnitPrice: null }] })).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.holding.update).not.toHaveBeenCalled();
  });

  it("checks name and unit against stored kind", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "investment" } as never);
    prismaMock.holding.findMany.mockResolvedValue([stored("h1", { kind: "other" })] as never);
    await expect(apply({ upsert: [{ id: "h1", name: null }] })).rejects.toMatchObject({ statusCode: 400 });
    prismaMock.holding.findMany.mockResolvedValue([stored("h1")] as never);
    await expect(apply({ upsert: [{ id: "h1", unit: "oz" }] })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("provider-linked securities", () => {
  const linkedStored = (id: string, extra: Record<string, unknown> = {}) =>
    stored(id, { kind: "stock", code: "AAPL", exchange: "XNGS", quoteCurrency: "USD", ...extra });
  const newLinked = { kind: "stock", code: "AAPL", exchange: "XNGS", quoteCurrency: "USD", name: "Apple Inc.", quantity: "10" };

  beforeEach(() => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "investment" } as never);
    vi.mocked(refreshSecurityQuotes).mockResolvedValue(undefined);
  });

  it("creates a linked holding without a manual price and refreshes its listing after the commit", async () => {
    await apply({ upsert: [newLinked] });

    expect(prismaMock.holding.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: "AAPL", name: "Apple Inc.", exchange: "XNGS", quoteCurrency: "USD" })
    });
    expect(refreshSecurityQuotes).toHaveBeenCalledWith([{ symbol: "AAPL", exchange: "XNGS", quoteCurrency: "USD" }]);
  });

  it("does not refresh a linked create that carries a manual price", async () => {
    await apply({ upsert: [{ ...newLinked, manualUnitPrice: "340", manualPriceCurrency: "USD" }] });
    expect(refreshSecurityQuotes).not.toHaveBeenCalled();
  });

  it("refreshes when the manual price of a linked holding is cleared and allows the clear", async () => {
    prismaMock.holding.findMany.mockResolvedValue([linkedStored("h1", { manualUnitPrice: dec("340") })] as never);
    await apply({ upsert: [{ id: "h1", manualUnitPrice: null }] });

    expect(prismaMock.holding.update).toHaveBeenCalledWith({
      where: { id: "h1", accountId: "acc-1", userId: "user-1" },
      data: { manualUnitPrice: null, manualPriceCurrency: null, manualPricedAt: null }
    });
    expect(refreshSecurityQuotes).toHaveBeenCalledWith([{ symbol: "AAPL", exchange: "XNGS", quoteCurrency: "USD" }]);
  });

  it("makes no provider call for a quantity-only edit", async () => {
    prismaMock.holding.findMany.mockResolvedValue([linkedStored("h1")] as never);
    await apply({ upsert: [{ id: "h1", quantity: "11" }] });
    expect(refreshSecurityQuotes).not.toHaveBeenCalled();
  });

  it("still rejects clearing the price of an unlinked stock", async () => {
    prismaMock.holding.findMany.mockResolvedValue([stored("h1", { kind: "stock", code: "AAPL", manualUnitPrice: dec("1") })] as never);
    await expect(apply({ upsert: [{ id: "h1", manualUnitPrice: null }] })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a second unlinked (kind, code) in the account", async () => {
    prismaMock.holding.findFirst.mockResolvedValue({ id: "h9" } as never);
    await expect(
      apply({ upsert: [{ kind: "stock", code: "AAPL", quantity: "1", manualUnitPrice: "1", manualPriceCurrency: "USD" }] })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.holding.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: "acc-1", userId: "user-1", kind: "stock", code: "AAPL", exchange: null } })
    );
    expect(prismaMock.holding.create).not.toHaveBeenCalled();
  });

  it("never fails the save when the refresh rejects", async () => {
    vi.mocked(refreshSecurityQuotes).mockRejectedValue(new Error("boom"));
    await expect(apply({ upsert: [newLinked] })).resolves.toBe(body);
  });
});

describe("refreshAccountHoldings", () => {
  beforeEach(() => {
    vi.mocked(refreshSecurityQuotes).mockResolvedValue(undefined);
  });

  it("404s for an account the user does not own without refreshing", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);
    await expect(refreshAccountHoldings("user-1", "other")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.account.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "other", userId: "user-1" } }));
    expect(refreshSecurityQuotes).not.toHaveBeenCalled();
  });

  it("refreshes the account's linked holdings without a manual price and returns the GET body", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1" } as never);
    prismaMock.holding.findMany.mockResolvedValue([{ code: "AAPL", exchange: "XNGS", quoteCurrency: "USD" }] as never);

    expect(await refreshAccountHoldings("user-1", "acc-1")).toBe(body);

    expect(prismaMock.holding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ accountId: "acc-1", userId: "user-1", manualUnitPrice: null }) })
    );
    expect(refreshSecurityQuotes).toHaveBeenCalledWith([{ symbol: "AAPL", exchange: "XNGS", quoteCurrency: "USD" }]);
  });

  it("returns the stored body when the refresh fails", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1" } as never);
    prismaMock.holding.findMany.mockResolvedValue([{ code: "AAPL", exchange: "XNGS", quoteCurrency: "USD" }] as never);
    vi.mocked(refreshSecurityQuotes).mockRejectedValue(new Error("boom"));
    expect(await refreshAccountHoldings("user-1", "acc-1")).toBe(body);
  });
});
