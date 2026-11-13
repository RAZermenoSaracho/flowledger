import { describe, expect, it } from "vitest";
import { HttpError } from "../../../../utils/httpError.js";
import { resolveAppliedAmounts } from "../appliedAmounts.js";

function fieldErrorsOf(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    const httpError = error as HttpError;
    expect(httpError.statusCode).toBe(400);
    return (httpError.details as { issues: { fieldErrors: Record<string, string[]> } }).issues
      .fieldErrors;
  }
  throw new Error("expected a 400");
}

describe("resolveAppliedAmounts", () => {
  it("copies amount to the account side when the currencies are equal", () => {
    const result = resolveAppliedAmounts({
      type: "expense",
      amount: "10.50",
      executionCurrency: "MXN",
      accountCurrency: "MXN"
    });

    expect(result.accountAmount?.toFixed()).toBe("10.5");
    expect(result.destinationAmount).toBeNull();
    expect(result.feeAmount).toBeNull();
  });

  it("accepts an equal stated value and rejects a mismatching one with 400", () => {
    const base = {
      type: "expense" as const,
      amount: "10.5",
      executionCurrency: "MXN",
      accountCurrency: "MXN"
    };

    expect(resolveAppliedAmounts({ ...base, accountAmount: "10.50" }).accountAmount?.toFixed()).toBe(
      "10.5"
    );
    expect(Object.keys(fieldErrorsOf(() => resolveAppliedAmounts({ ...base, accountAmount: "11" })))).toEqual([
      "accountAmount"
    ]);
  });

  it("has no applied amounts for a transaction without an account", () => {
    const result = resolveAppliedAmounts({
      type: "expense",
      amount: "5",
      executionCurrency: "USD"
    });

    expect(result.accountAmount).toBeNull();
    expect(result.destinationAmount).toBeNull();
  });

  it("requires a stated accountAmount across currencies, naming the field", () => {
    const errors = fieldErrorsOf(() =>
      resolveAppliedAmounts({
        type: "expense",
        amount: "20",
        executionCurrency: "USD",
        accountCurrency: "MXN"
      })
    );

    expect(Object.keys(errors)).toEqual(["accountAmount"]);
  });

  it("uses the stated accountAmount across currencies", () => {
    const result = resolveAppliedAmounts({
      type: "expense",
      amount: "20",
      executionCurrency: "USD",
      accountCurrency: "MXN",
      accountAmount: "342.10"
    });

    expect(result.accountAmount?.toFixed()).toBe("342.1");
  });

  it("requires destinationAmount for a cross-currency transfer and applies both legs", () => {
    const transfer = {
      type: "transfer" as const,
      amount: "100",
      executionCurrency: "USD",
      accountCurrency: "USD",
      destinationCurrency: "MXN"
    };

    expect(Object.keys(fieldErrorsOf(() => resolveAppliedAmounts(transfer)))).toEqual([
      "destinationAmount"
    ]);
    const result = resolveAppliedAmounts({ ...transfer, destinationAmount: "1712.50" });
    expect(result.accountAmount?.toFixed()).toBe("100");
    expect(result.destinationAmount?.toFixed()).toBe("1712.5");
  });

  it("copies destinationAmount for a same-currency transfer", () => {
    const result = resolveAppliedAmounts({
      type: "transfer",
      amount: "100",
      executionCurrency: "MXN",
      accountCurrency: "MXN",
      destinationCurrency: "MXN"
    });

    expect(result.destinationAmount?.toFixed()).toBe("100");
  });

  it("rejects a stated destinationAmount on a non-transfer and accountAmount without an account", () => {
    expect(
      Object.keys(
        fieldErrorsOf(() =>
          resolveAppliedAmounts({
            type: "expense",
            amount: "1",
            executionCurrency: "USD",
            accountCurrency: "USD",
            destinationAmount: "1"
          })
        )
      )
    ).toEqual(["destinationAmount"]);
    expect(
      Object.keys(
        fieldErrorsOf(() =>
          resolveAppliedAmounts({ type: "expense", amount: "1", executionCurrency: "USD", accountAmount: "1" })
        )
      )
    ).toEqual(["accountAmount"]);
  });

  describe("precision", () => {
    it("rejects over-precision fiat and never rounds", () => {
      expect(
        Object.keys(
          fieldErrorsOf(() =>
            resolveAppliedAmounts({ type: "expense", amount: "10.005", executionCurrency: "USD", accountCurrency: "USD" })
          )
        )
      ).toEqual(["amount"]);
    });

    it("allows JPY without decimals only", () => {
      const jpy = { type: "expense" as const, executionCurrency: "JPY", accountCurrency: "JPY" };

      expect(resolveAppliedAmounts({ ...jpy, amount: "1500" }).accountAmount?.toFixed()).toBe("1500");
      expect(() => resolveAppliedAmounts({ ...jpy, amount: "1500.5" })).toThrow(HttpError);
    });

    it("allows 18 decimals for a non-ISO currency", () => {
      const btc = { type: "income" as const, executionCurrency: "BTC", accountCurrency: "BTC" };

      expect(
        resolveAppliedAmounts({ ...btc, amount: "1.234567890123456789" }).accountAmount?.toFixed()
      ).toBe("1.234567890123456789");
    });

    it("checks the stated applied amount against the account currency's minor units", () => {
      expect(
        Object.keys(
          fieldErrorsOf(() =>
            resolveAppliedAmounts({
              type: "expense",
              amount: "20",
              executionCurrency: "USD",
              accountCurrency: "MXN",
              accountAmount: "342.105"
            })
          )
        )
      ).toEqual(["accountAmount"]);
    });
  });

  describe("fee", () => {
    const transfer = {
      type: "transfer" as const,
      amount: "100",
      executionCurrency: "USD",
      accountCurrency: "USD",
      destinationCurrency: "MXN",
      destinationAmount: "1666"
    };

    it("requires feeAmount and feeCurrency together", () => {
      expect(Object.keys(fieldErrorsOf(() => resolveAppliedAmounts({ ...transfer, feeAmount: "2" })))).toEqual([
        "feeCurrency"
      ]);
      expect(Object.keys(fieldErrorsOf(() => resolveAppliedAmounts({ ...transfer, feeCurrency: "USD" })))).toEqual([
        "feeAmount"
      ]);
    });

    it("accepts a fee in the source or the destination currency", () => {
      expect(resolveAppliedAmounts({ ...transfer, feeAmount: "2", feeCurrency: "usd" })).toMatchObject({
        feeCurrency: "USD"
      });
      expect(resolveAppliedAmounts({ ...transfer, feeAmount: "30", feeCurrency: "MXN" }).feeAmount?.toFixed()).toBe(
        "30"
      );
    });

    it("rejects a fee in a third currency and an over-precise fee", () => {
      expect(
        Object.keys(fieldErrorsOf(() => resolveAppliedAmounts({ ...transfer, feeAmount: "2", feeCurrency: "EUR" })))
      ).toEqual(["feeCurrency"]);
      expect(
        Object.keys(fieldErrorsOf(() => resolveAppliedAmounts({ ...transfer, feeAmount: "2.001", feeCurrency: "USD" })))
      ).toEqual(["feeAmount"]);
    });

    it("allows the execution or the account currency as a non-transfer fee currency", () => {
      const expense = {
        type: "expense" as const,
        amount: "20",
        executionCurrency: "USD",
        accountCurrency: "MXN",
        accountAmount: "340",
        feeAmount: "1"
      };
      expect(resolveAppliedAmounts({ ...expense, feeCurrency: "MXN" }).feeCurrency).toBe("MXN");
      expect(resolveAppliedAmounts({ ...expense, feeCurrency: "USD" }).feeCurrency).toBe("USD");
      expect(() => resolveAppliedAmounts({ ...expense, feeCurrency: "EUR" })).toThrow(HttpError);
    });

    it("does not allow the account currency as a transfer fee currency", () => {
      expect(() =>
        resolveAppliedAmounts({ ...transfer, accountCurrency: "EUR", feeAmount: "1", feeCurrency: "EUR" })
      ).toThrow(HttpError);
    });
  });
});
