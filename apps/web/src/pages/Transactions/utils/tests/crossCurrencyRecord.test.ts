import { describe, expect, it } from "vitest";
import type { Transaction } from "../../../../types/transactions.types";
import { crossCurrencyRecord } from "../crossCurrencyRecord";

const transfer = (overrides: Partial<Transaction> = {}) =>
  ({
    id: "t",
    name: "Move",
    amount: "100",
    executionCurrency: "USD",
    type: "transfer",
    account: { currency: "USD" },
    transferToAccount: { currency: "MXN" },
    destinationAmount: "1700",
    ...overrides
  }) as Transaction;

describe("crossCurrencyRecord", () => {
  it("is null for a single-currency transaction", () => {
    expect(crossCurrencyRecord(transfer({ transferToAccount: { currency: "USD" } as Transaction["transferToAccount"] }))).toBeNull();
    expect(crossCurrencyRecord(transfer({ type: "expense", account: { currency: "USD" } as Transaction["account"] }))).toBeNull();
  });

  it("derives the effective rate with no fee", () => {
    expect(crossCurrencyRecord(transfer())).toMatchObject({
      targetAmount: "1700",
      targetCurrency: "MXN",
      effectiveRate: "17",
      fee: null,
      rateBeforeFee: null
    });
  });

  it("derives the rate before a source-currency fee", () => {
    const record = crossCurrencyRecord(transfer({ destinationAmount: "1666", feeAmount: "2", feeCurrency: "USD" }));
    expect(record?.effectiveRate).toBe("16.66");
    expect(record?.rateBeforeFee).toBe("17");
  });

  it("derives the rate before a destination-currency fee", () => {
    const record = crossCurrencyRecord(transfer({ destinationAmount: "1690", feeAmount: "10", feeCurrency: "MXN" }));
    expect(record?.rateBeforeFee).toBe("17");
  });

  it("uses the account amount for an income or expense", () => {
    const record = crossCurrencyRecord(
      transfer({ type: "expense", accountAmount: "1700", account: { currency: "MXN" } as Transaction["account"] })
    );
    expect(record).toMatchObject({ targetCurrency: "MXN", effectiveRate: "17" });
  });
});
