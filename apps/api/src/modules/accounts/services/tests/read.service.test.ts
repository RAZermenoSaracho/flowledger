import { Prisma } from "@prisma/client";
import { serialize } from "../../../../utils/serialize.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../../../currencies/services/read.service.js", () => ({
  getExchangeRate: vi.fn()
}));

const { getExchangeRate } = await import("../../../currencies/services/read.service.js");
const getExchangeRateMock = vi.mocked(getExchangeRate);

const { listAccounts } = await import("../read.service.js");

function setupBaseMocks() {
  prismaMock.user.findUniqueOrThrow.mockResolvedValue({
    preferredCurrency: null
  } as never);
  prismaMock.account.findMany.mockResolvedValue([]);
  prismaMock.account.count.mockResolvedValue(0);
  prismaMock.transaction.findMany.mockResolvedValue([]);
  prismaMock.holding.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  setupBaseMocks();
});

describe("listAccounts — query param handling", () => {
  it("scopes to the user with no query param", async () => {
    await listAccounts("user-1", undefined);

    expect(prismaMock.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: { equals: "user-1" } }
      })
    );
  });

  it("rejects invalid JSON", async () => {
    await expect(listAccounts("user-1", "{not json")).rejects.toThrow(
      "Invalid accounts query: not valid JSON"
    );
  });

  it("rejects a non-object query", async () => {
    await expect(listAccounts("user-1", "[1,2]")).rejects.toThrow(
      "Invalid accounts query: must be a JSON object"
    );
  });
});

describe("listAccounts — 'source' virtual field", () => {
  it("rewrites source = 'synced' into a providerAccounts exists condition", async () => {
    await listAccounts(
      "user-1",
      JSON.stringify({ where: { field: "source", op: "=", value: "synced" } })
    );

    const call = prismaMock.account.findMany.mock.calls[0]?.[0] as {
      where: { AND: unknown[] };
    };
    expect(JSON.stringify(call.where)).toContain("providerAccounts");
    expect(JSON.stringify(call.where)).toContain("some");
  });

  it("rewrites source = 'manual' into a providerAccounts notExists (none) condition", async () => {
    await listAccounts(
      "user-1",
      JSON.stringify({ where: { field: "source", op: "=", value: "manual" } })
    );

    const call = prismaMock.account.findMany.mock.calls[0]?.[0] as {
      where: { AND: unknown[] };
    };
    expect(JSON.stringify(call.where)).toContain("none");
  });

  it("rewrites source in ['synced','manual'] (both) into an unconstrained condition", async () => {
    await listAccounts(
      "user-1",
      JSON.stringify({
        where: { field: "source", op: "in", value: ["synced", "manual"] }
      })
    );

    // Both match -> the account list is still scoped only by userId; no
    // providerAccounts clause should be added.
    const call = prismaMock.account.findMany.mock.calls[0]?.[0] as {
      where: { AND: unknown[] };
    };
    expect(JSON.stringify(call.where)).not.toContain("providerAccounts");
  });

  it("negating with != inverts which source matches", async () => {
    await listAccounts(
      "user-1",
      JSON.stringify({ where: { field: "source", op: "!=", value: "synced" } })
    );

    // != synced means "manual" matches -> notExists (none).
    const call = prismaMock.account.findMany.mock.calls[0]?.[0] as {
      where: { AND: unknown[] };
    };
    expect(JSON.stringify(call.where)).toContain("none");
  });

  it("combines a source condition with other filters via and/or", async () => {
    await listAccounts(
      "user-1",
      JSON.stringify({
        where: {
          and: [
            { field: "source", op: "=", value: "synced" },
            { field: "isArchived", op: "=", value: false }
          ]
        }
      })
    );

    const call = prismaMock.account.findMany.mock.calls[0]?.[0] as {
      where: { AND: unknown[] };
    };
    expect(JSON.stringify(call.where)).toContain("providerAccounts");
    expect(JSON.stringify(call.where)).toContain("isArchived");
  });
});

describe("listAccounts — currency enrichment", () => {
  it("does not call getExchangeRate when there's no preferred currency", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      preferredCurrency: null
    } as never);
    prismaMock.account.findMany.mockResolvedValue([
      { id: "acc-1", currency: "USD", providerAccounts: [] }
    ] as never);

    const result = await listAccounts("user-1", undefined);

    expect(getExchangeRateMock).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({ currentBalanceInPreferredCurrency: 0 });
  });

  it("converts to preferred currency when it differs from the account's own", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      preferredCurrency: "MXN"
    } as never);
    prismaMock.account.findMany.mockResolvedValue([
      { id: "acc-1", currency: "USD", initialBalance: 100, providerAccounts: [] }
    ] as never);
    getExchangeRateMock.mockResolvedValue(17);

    const result = await listAccounts("user-1", undefined);

    expect(getExchangeRateMock).toHaveBeenCalledWith("USD", "MXN");
    expect(result[0]).toMatchObject({
      currentBalanceInPreferredCurrency: 1700
    });
  });

  it("marks source 'manual' when there are no providerAccounts", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      { id: "acc-1", currency: "USD", providerAccounts: [] }
    ] as never);

    const [account] = await listAccounts("user-1", undefined);
    expect(account?.source).toBe("manual");
  });
});

describe("listAccounts — native balances", () => {
  it("selects the applied-amount columns and balances each account by its own applied amounts", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      { id: "usd", currency: "USD", initialBalance: new Prisma.Decimal("500"), providerAccounts: [] },
      { id: "mxn", currency: "MXN", initialBalance: new Prisma.Decimal("0"), providerAccounts: [] }
    ] as never);
    prismaMock.transaction.findMany.mockResolvedValue([
      {
        accountId: "usd",
        transferToAccountId: "mxn",
        type: "transfer",
        accountAmount: new Prisma.Decimal("100"),
        destinationAmount: new Prisma.Decimal("1712.5")
      }
    ] as never);

    const result = await listAccounts("user-1", undefined);

    expect(prismaMock.transaction.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: {
        accountId: true,
        transferToAccountId: true,
        type: true,
        accountAmount: true,
        destinationAmount: true
      }
    });
    expect(serialize(result).map((account) => account.currentBalance)).toEqual(["400", "1712.5"]);
  });
});

describe("listAccounts — holdings valuation", () => {
  it("attaches null to accounts without holdings and the aggregate with holdingCount to those with holdings", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      { id: "plain", currency: "USD", initialBalance: new Prisma.Decimal("10"), providerAccounts: [] },
      { id: "inv", type: "investment", currency: "USD", initialBalance: new Prisma.Decimal("1000"), providerAccounts: [] }
    ] as never);
    prismaMock.holding.findMany.mockResolvedValue([
      {
        id: "h1",
        userId: "user-1",
        accountId: "inv",
        kind: "fiat",
        code: "USD",
        quantity: new Prisma.Decimal("850"),
        manualUnitPrice: null,
        manualPriceCurrency: null,
        manualPricedAt: null
      }
    ] as never);

    const result = serialize(await listAccounts("user-1", undefined));

    expect(prismaMock.holding.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.holding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", accountId: { in: ["inv"] } } })
    );
    const byId = Object.fromEntries(result.map((account) => [account.id, account]));
    expect(byId.plain!.holdingsValuation).toBeNull();
    expect(byId.plain!.currentBalance).toBe("10");
    expect(byId.inv!.holdingsValuation).toEqual({
      currency: "USD",
      value: "850.00",
      status: "complete",
      missingCount: 0,
      holdingCount: 1
    });
    expect(byId.inv!.currentBalance).toBe("1000");
  });
});

describe("empty holding accounts", () => {
  it.each(["investment", "crypto"])("returns an empty valuation for %s despite ledger funds", async (type) => {
    prismaMock.account.findMany.mockResolvedValue([{ id: "inv", type, currency: "USD", initialBalance: new Prisma.Decimal("1000"), providerAccounts: [] }] as never);
    prismaMock.holding.findMany.mockResolvedValue([]);
    const result = await listAccounts("user-1", undefined);
    expect(result[0]!.holdingsValuation).toEqual({ currency: "USD", value: "0.00", status: "empty", missingCount: 0, holdingCount: 0 });
  });
});
