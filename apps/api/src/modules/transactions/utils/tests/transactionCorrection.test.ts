import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { financialFieldsChanged, financialSnapshot } from "../transactionCorrection.js";

const base = {
  type: "transfer",
  amount: new Prisma.Decimal("100"),
  executionCurrency: "USD",
  accountId: "a",
  transferToAccountId: "b",
  accountAmount: new Prisma.Decimal("100"),
  destinationAmount: new Prisma.Decimal("1712.50"),
  feeAmount: null,
  feeCurrency: null,
  date: new Date("2026-11-05T00:00:00.000Z")
};

describe("financialSnapshot", () => {
  it("renders decimals as exact strings and the date as an ISO instant", () => {
    expect(financialSnapshot(base)).toEqual({
      type: "transfer",
      amount: "100",
      executionCurrency: "USD",
      accountId: "a",
      transferToAccountId: "b",
      accountAmount: "100",
      destinationAmount: "1712.5",
      feeAmount: null,
      feeCurrency: null,
      date: "2026-11-05T00:00:00.000Z"
    });
  });

  it("keeps 18 decimals without an exponent", () => {
    expect(
      financialSnapshot({ ...base, amount: new Prisma.Decimal("0.000000000000000001") }).amount
    ).toBe("0.000000000000000001");
  });
});

describe("financialFieldsChanged", () => {
  it("is false for equal snapshots and for a non-financial difference", () => {
    expect(financialFieldsChanged(financialSnapshot(base), financialSnapshot({ ...base }))).toBe(false);
  });

  it("is true when one financial field differs", () => {
    expect(
      financialFieldsChanged(
        financialSnapshot(base),
        financialSnapshot({ ...base, destinationAmount: new Prisma.Decimal("1690") })
      )
    ).toBe(true);
  });
});
