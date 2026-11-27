import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { getBillingPeriod } from "../creditCard.read.service.js";
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

  it("rejects overlapping and due-before-closing values without writing", async () => {
    await expect(
      updateBillingPeriodOverride("user-1", "card-1", "2026-11", { closingDate: "2026-10-20" }, NOW)
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      updateBillingPeriodOverride("user-1", "card-1", "2026-11", { dueDate: "2026-11-20" }, NOW)
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("after its closing") });
    expect(prismaMock.creditCardPeriodOverride.upsert).not.toHaveBeenCalled();
  });

  it("gives the closing-date error for a date before the previous closing, not a neighbour's due error", async () => {
    await expect(
      updateBillingPeriodOverride("user-1", "card-1", "2026-11", { closingDate: "2026-10-15" }, NOW)
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/2026-11.*closing date must be after the previous/) });
  });

  it("keeps the owner's example contiguous and leaves other periods unchanged", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ ...card, paymentDueValue: 10 } as never);
    const period = await updateBillingPeriodOverride("user-1", "card-1", "2026-11", { closingDate: "2026-11-19" }, NOW);
    expect(period).toMatchObject({ start: "2026-10-21", end: "2026-11-19" });
    const next = await getBillingPeriod("user-1", "card-1", "2026-12", NOW);
    expect(next).toMatchObject({ start: "2026-11-20", end: "2026-12-20", endAdjusted: false });
    const previous = await getBillingPeriod("user-1", "card-1", "2026-10", NOW);
    expect(previous).toMatchObject({ end: "2026-10-20", endAdjusted: false });
  });

  it("lets a closing move before the previous period's due date and leaves every due date untouched", async () => {
    rows = [stored({ monthIndex: november - 1, dueDate: utc("2026-11-18") })];
    const before = structuredClone(rows);
    await updateBillingPeriodOverride("user-1", "card-1", "2026-11", { closingDate: "2026-11-17" }, NOW);
    expect(rows).toEqual([...before, stored({ closingDate: utc("2026-11-17") })]);
    expect(prismaMock.creditCardPeriodOverride.upsert).toHaveBeenCalledTimes(1);
  });

  it("accepts a due date after the next period's closing", async () => {
    await expect(
      updateBillingPeriodOverride("user-1", "card-1", "2026-11", { dueDate: "2026-12-28" }, NOW)
    ).resolves.toMatchObject({ key: "2026-11", dueDate: "2026-12-28", dueAdjusted: true });
  });

  describe("replaying the six institution periods (closing 18, due day 18 of next month)", () => {
    const plata = { ...card, createdAt: new Date("2026-05-01T00:00:00Z"), statementClosingDay: 18, paymentDueValue: 18 };
    const NOV_NOW = new Date("2026-11-27T18:00:00Z");
    const edits: Array<[string, string]> = [
      ["2026-07", "2026-07-20"],
      ["2026-10", "2026-10-19"]
    ];

    for (const [name, order] of [["oldest first", edits], ["newest first", [...edits].reverse()]] as const) {
      it(`succeeds with one override row per edit, ${name}`, async () => {
        prismaMock.account.findFirst.mockResolvedValue(plata as never);
        for (const [key, closingDate] of order) {
          const others = structuredClone(rows);
          await updateBillingPeriodOverride("user-1", "card-1", key, { closingDate }, NOV_NOW);
          expect(rows).toHaveLength(others.length + 1);
          expect(rows.slice(0, others.length)).toEqual(others);
        }
        const periods = await Promise.all(
          ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"].map((key) =>
            getBillingPeriod("user-1", "card-1", key, NOV_NOW)
          )
        );
        expect(periods.map((period) => [period!.start, period!.end, period!.dueDate])).toEqual([
          ["2026-05-19", "2026-06-18", "2026-07-18"],
          ["2026-06-19", "2026-07-20", "2026-08-18"],
          ["2026-07-21", "2026-08-18", "2026-09-18"],
          ["2026-08-19", "2026-09-18", "2026-10-18"],
          ["2026-09-19", "2026-10-19", "2026-11-18"],
          ["2026-10-20", "2026-11-18", "2026-12-18"]
        ]);
        expect(rows.every((row) => row.dueDate === null)).toBe(true);
      });
    }

    it("accepts an Oct due date past the next closing without touching other rows", async () => {
      prismaMock.account.findFirst.mockResolvedValue(plata as never);
      rows = [stored({ monthIndex: november - 1, closingDate: utc("2026-10-19") })];
      await updateBillingPeriodOverride("user-1", "card-1", "2026-10", { dueDate: "2026-11-25" }, NOV_NOW);
      expect(rows).toEqual([stored({ monthIndex: november - 1, closingDate: utc("2026-10-19"), dueDate: utc("2026-11-25") })]);
    });
  });

  it("runs in a Serializable transaction and maps a serialization failure to 409", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "x" })
    );
    await expect(
      updateBillingPeriodOverride("user-1", "card-1", "2026-11", { closingDate: "2026-11-23" }, NOW)
    ).rejects.toMatchObject({ statusCode: 409 });
    await updateBillingPeriodOverride("user-1", "card-1", "2026-11", { closingDate: "2026-11-23" }, NOW);
    expect(prismaMock.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    });
  });

  it("stores nothing when the write fails", async () => {
    prismaMock.creditCardPeriodOverride.upsert.mockRejectedValueOnce(new Error("db down"));
    await expect(
      updateBillingPeriodOverride("user-1", "card-1", "2026-11", { closingDate: "2026-11-23" }, NOW)
    ).rejects.toThrow("db down");
    expect(rows).toEqual([]);
  });

  it("reads calendar dates in the card's billing zone, not the server's", async () => {
    const period = await updateBillingPeriodOverride("user-1", "card-1", "2026-11", { closingDate: "2026-11-23" }, NOW);
    expect(period.end).toBe("2026-11-23");
    expect(rows[0]?.closingDate).toEqual(utc("2026-11-23"));
  });

  it("never writes to the ledger or the account", async () => {
    await updateBillingPeriodOverride("user-1", "card-1", "2026-11", { closingDate: "2026-11-23" }, NOW);
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
    expect(prismaMock.transaction.update).not.toHaveBeenCalled();
    expect(prismaMock.transaction.delete).not.toHaveBeenCalled();
    expect(prismaMock.account.update).not.toHaveBeenCalled();
  });
});
