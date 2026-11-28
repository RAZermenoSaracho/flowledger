import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { getBillingPeriod, getCreditCardBilling, loadCardEntries, loadCardOverrides } from "../creditCard.read.service.js";

const card = {
  id: "card-1",
  currency: "MXN",
  initialBalance: new Prisma.Decimal(0),
  createdAt: new Date("2026-09-25T00:00:00Z"),
  creditLimit: new Prisma.Decimal(30000),
  statementClosingDay: 20,
  paymentDueRule: "day_of_next_month",
  paymentDueValue: 20,
  billingTimeZone: "America/Mexico_City",
  annualInterestRate: null
};

const row = (over: Record<string, unknown>) => ({
  type: "expense",
  accountId: "card-1",
  transferToAccountId: null,
  accountAmount: new Prisma.Decimal(100),
  destinationAmount: null,
  date: new Date("2026-10-01T18:00:00Z"),
  creditCardKind: null,
  ...over
});

describe("loadCardEntries", () => {
  it("runs exactly two user-scoped queries for several cards and groups entries per card", async () => {
    prismaMock.transaction.findMany
      .mockResolvedValueOnce([row({}), row({ accountId: "card-2" })] as never)
      .mockResolvedValueOnce([
        row({ type: "transfer", accountId: "debit", transferToAccountId: "card-2", destinationAmount: new Prisma.Decimal(40) })
      ] as never);

    const result = await loadCardEntries("user-1", ["card-1", "card-2", "card-3"]);

    expect(prismaMock.transaction.findMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.transaction.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { userId: "user-1", accountId: { in: ["card-1", "card-2", "card-3"] } } })
    );
    expect(prismaMock.transaction.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { userId: "user-1", type: "transfer", transferToAccountId: { in: ["card-1", "card-2", "card-3"] } }
      })
    );
    expect(result.get("card-1")).toHaveLength(1);
    expect(result.get("card-2")?.map((entry) => entry.role)).toEqual(["charge", "credit"]);
    expect(result.get("card-3")).toEqual([]);
  });

  it("runs no query for an empty id list", async () => {
    expect((await loadCardEntries("user-1", [])).size).toBe(0);
    expect(prismaMock.transaction.findMany).not.toHaveBeenCalled();
  });
});

describe("getCreditCardBilling", () => {
  it("looks the card up scoped to the user and type, and computes billing from two queries", async () => {
    prismaMock.account.findFirst.mockResolvedValue(card as never);
    prismaMock.transaction.findMany.mockResolvedValueOnce([row({ accountAmount: new Prisma.Decimal(5000) })] as never);
    prismaMock.transaction.findMany.mockResolvedValueOnce([] as never);
    prismaMock.creditCardPeriodOverride.findMany.mockResolvedValue([]);

    const billing = await getCreditCardBilling("user-1", "card-1", 1, new Date("2026-10-02T18:00:00Z"));

    expect(prismaMock.account.findFirst).toHaveBeenCalledWith({
      where: { id: "card-1", userId: "user-1", type: "credit_card" }
    });
    expect(prismaMock.transaction.findMany).toHaveBeenCalledTimes(2);
    expect(billing).toMatchObject({ accountId: "card-1", configured: true, metrics: { debt: "5000", availableCredit: "25000" } });
  });

  it("throws a 404 for a missing, foreign or non-card account", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);
    await expect(getCreditCardBilling("user-1", "x", 1)).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.transaction.findMany).not.toHaveBeenCalled();
  });
});

describe("loadCardOverrides", () => {
  it("runs one user-scoped query and maps rows to local dates per card", async () => {
    prismaMock.creditCardPeriodOverride.findMany.mockResolvedValue([
      { accountId: "card-1", monthIndex: 24322, closingDate: new Date("2026-11-23T00:00:00Z"), dueDate: null },
      { accountId: "card-2", monthIndex: 24322, closingDate: null, dueDate: new Date("2026-12-18T00:00:00Z") }
    ] as never);

    const result = await loadCardOverrides("user-1", ["card-1", "card-2", "card-3"]);

    expect(prismaMock.creditCardPeriodOverride.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.creditCardPeriodOverride.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", accountId: { in: ["card-1", "card-2", "card-3"] } }
    });
    expect(result.get("card-1")).toEqual(new Map([[24322, { closingDate: { y: 2026, m: 11, d: 23 } }]]));
    expect(result.get("card-2")).toEqual(new Map([[24322, { dueDate: { y: 2026, m: 12, d: 18 } }]]));
    expect(result.get("card-3")).toEqual(new Map());
  });

  it("runs no query for an empty id list", async () => {
    expect((await loadCardOverrides("user-1", [])).size).toBe(0);
    expect(prismaMock.creditCardPeriodOverride.findMany).not.toHaveBeenCalled();
  });
});

describe("getBillingPeriod", () => {
  const now = new Date("2026-12-05T18:00:00Z");
  beforeEach(() => {
    prismaMock.account.findFirst.mockResolvedValue(card as never);
    prismaMock.transaction.findMany.mockResolvedValue([] as never);
    prismaMock.creditCardPeriodOverride.findMany.mockResolvedValue([]);
  });

  it("returns the period with the given key", async () => {
    expect(await getBillingPeriod("user-1", "card-1", "2026-11", now)).toMatchObject({ key: "2026-11", end: "2026-11-20" });
  });

  it("returns null for a key after the open period or before the first", async () => {
    expect(await getBillingPeriod("user-1", "card-1", "2027-03", now)).toBeNull();
    expect(await getBillingPeriod("user-1", "card-1", "2026-01", now)).toBeNull();
  });

  it("finds periods beyond the first page", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ ...card, createdAt: new Date("2024-01-05T00:00:00Z") } as never);
    expect(await getBillingPeriod("user-1", "card-1", "2024-02", now)).toMatchObject({ key: "2024-02" });
  });
});
