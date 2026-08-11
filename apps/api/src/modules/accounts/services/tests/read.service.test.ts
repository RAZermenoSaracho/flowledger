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
