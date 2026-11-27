import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { updateBillingPeriodOverride } from "../creditCard.update.service.js";

const card = {
  id: "card-1",
  userId: "user-1",
  type: "credit_card",
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

const NOW = new Date("2026-12-05T18:00:00Z");
const utc = (value: string) => new Date(`${value}T00:00:00Z`);
const november = 2026 * 12 + 10;

type Row = { accountId: string; userId: string; monthIndex: number; closingDate: Date | null; dueDate: Date | null };
let rows: Row[];

beforeEach(() => {
  rows = [];
  prismaMock.account.findFirst.mockResolvedValue(card as never);
  prismaMock.transaction.findFirst.mockResolvedValue(null);
  prismaMock.transaction.findMany.mockResolvedValue([] as never);
  prismaMock.creditCardPeriodOverride.findMany.mockImplementation((async () => rows) as never);
  prismaMock.creditCardPeriodOverride.upsert.mockImplementation((async ({ create, update }: { create: Row; update: Row }) => {
    const existing = rows.find((row) => row.monthIndex === create.monthIndex);
    if (existing) Object.assign(existing, update);
    else rows.push({ ...create });
    return create;
  }) as never);
  prismaMock.creditCardPeriodOverride.deleteMany.mockImplementation((async ({ where }: { where: { monthIndex: number } }) => {
    rows = rows.filter((row) => row.monthIndex !== where.monthIndex);
    return { count: 1 };
  }) as never);
});

const stored = (over: Partial<Row>): Row => ({
  accountId: "card-1",
  userId: "user-1",
  monthIndex: november,
  closingDate: null,
  dueDate: null,
  ...over
});

describe("updateBillingPeriodOverride", () => {
  it("looks the card up scoped to the user and type and writes a closing override", async () => {
    const period = await updateBillingPeriodOverride("user-1", "card-1", "2026-11", { closingDate: "2026-11-23" }, NOW);

    expect(prismaMock.account.findFirst).toHaveBeenCalledWith({ where: { id: "card-1", userId: "user-1", type: "credit_card" } });
    expect(prismaMock.creditCardPeriodOverride.upsert).toHaveBeenCalledWith({
      where: { accountId_monthIndex: { accountId: "card-1", monthIndex: november } },
      create: { userId: "user-1", accountId: "card-1", monthIndex: november, closingDate: utc("2026-11-23"), dueDate: null },
      update: { closingDate: utc("2026-11-23"), dueDate: null }
    });
    expect(period).toMatchObject({ key: "2026-11", end: "2026-11-23", endAdjusted: true, dueAdjusted: false, defaultEnd: "2026-11-20" });
  });

  it("keeps the other date when only one field is patched", async () => {
    rows = [stored({ closingDate: utc("2026-11-23") })];
    const period = await updateBillingPeriodOverride("user-1", "card-1", "2026-11", { dueDate: "2026-12-18" }, NOW);

    expect(prismaMock.creditCardPeriodOverride.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { closingDate: utc("2026-11-23"), dueDate: utc("2026-12-18") } })
    );
    expect(period).toMatchObject({ end: "2026-11-23", dueDate: "2026-12-18", endAdjusted: true, dueAdjusted: true });
  });

  it("resets one date and keeps the row for the other", async () => {
    rows = [stored({ closingDate: utc("2026-11-23"), dueDate: utc("2026-12-18") })];
    const period = await updateBillingPeriodOverride("user-1", "card-1", "2026-11", { closingDate: null }, NOW);

    expect(prismaMock.creditCardPeriodOverride.deleteMany).not.toHaveBeenCalled();
    expect(period).toMatchObject({ end: "2026-11-20", endAdjusted: false, dueDate: "2026-12-18", dueAdjusted: true });
  });

  it("deletes the row when both dates are reset, and is idempotent", async () => {
    rows = [stored({ closingDate: utc("2026-11-23") })];
    const period = await updateBillingPeriodOverride("user-1", "card-1", "2026-11", { closingDate: null }, NOW);

    expect(prismaMock.creditCardPeriodOverride.deleteMany).toHaveBeenCalledWith({
      where: { accountId: "card-1", userId: "user-1", monthIndex: november }
    });
    expect(prismaMock.creditCardPeriodOverride.upsert).not.toHaveBeenCalled();
    expect(period).toMatchObject({ end: "2026-11-20", endAdjusted: false, dueAdjusted: false });
    await expect(
      updateBillingPeriodOverride("user-1", "card-1", "2026-11", { dueDate: null }, NOW)
    ).resolves.toMatchObject({ endAdjusted: false });
  });

  it("returns 404 for a card the user does not own and writes nothing", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);
    await expect(
      updateBillingPeriodOverride("user-2", "card-1", "2026-11", { closingDate: "2026-11-23" }, NOW)
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.creditCardPeriodOverride.upsert).not.toHaveBeenCalled();
    expect(prismaMock.creditCardPeriodOverride.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects a card without a billing cycle", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ ...card, statementClosingDay: null } as never);
    await expect(
      updateBillingPeriodOverride("user-1", "card-1", "2026-11", { closingDate: "2026-11-23" }, NOW)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects periods after the open one and before the first one", async () => {
    await expect(
      updateBillingPeriodOverride("user-1", "card-1", "2027-01", { closingDate: "2027-01-25" }, NOW)
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("2027-01") });
    await expect(
      updateBillingPeriodOverride("user-1", "card-1", "2026-08", { closingDate: "2026-08-25" }, NOW)
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.creditCardPeriodOverride.upsert).not.toHaveBeenCalled();
  });

  it("allows the open period and the first period", async () => {
    await expect(
      updateBillingPeriodOverride("user-1", "card-1", "2026-12", { closingDate: "2026-12-22" }, NOW)
    ).resolves.toMatchObject({ key: "2026-12", status: "open" });
    await expect(
      updateBillingPeriodOverride("user-1", "card-1", "2026-10", { dueDate: "2026-11-18" }, NOW)
    ).resolves.toMatchObject({ key: "2026-10", dueDate: "2026-11-18" });
  });

  it("rejects overlapping, due-before-closing and neighbour-breaking values without writing", async () => {
    await expect(
      updateBillingPeriodOverride("user-1", "card-1", "2026-11", { closingDate: "2026-10-20" }, NOW)
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      updateBillingPeriodOverride("user-1", "card-1", "2026-11", { dueDate: "2026-11-20" }, NOW)
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("after its closing") });
    await expect(
      updateBillingPeriodOverride("user-1", "card-1", "2026-11", { dueDate: "2026-12-21" }, NOW)
    ).rejects.toMatchObject({ statusCode: 400 });
    rows = [stored({ monthIndex: november - 1, dueDate: utc("2026-11-18") })];
    await expect(
      updateBillingPeriodOverride("user-1", "card-1", "2026-11", { closingDate: "2026-11-17" }, NOW)
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.creditCardPeriodOverride.upsert).not.toHaveBeenCalled();
  });

  it("never writes to the ledger or the account", async () => {
    await updateBillingPeriodOverride("user-1", "card-1", "2026-11", { closingDate: "2026-11-23" }, NOW);
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
    expect(prismaMock.transaction.update).not.toHaveBeenCalled();
    expect(prismaMock.transaction.delete).not.toHaveBeenCalled();
    expect(prismaMock.account.update).not.toHaveBeenCalled();
  });
});
