import { describe, expect, it } from "vitest";
import type { Account } from "../../../../types/accounts.types";
import { newTransactionDraft } from "../transactionDraft";
import {
  destinationAccountId,
  differingCurrency,
  feeApplies,
  feeCurrencyOptions,
  reconcileCurrencyFields
} from "../transactionCurrencies";

function account(id: string, currency: string): Account {
  return { id, name: id, type: "checking", currency, initialBalance: "0", isArchived: false, createdAt: "", updatedAt: "" };
}

const accounts = [account("usd", "USD"), account("mxn", "MXN"), account("eur", "EUR")];
const draft = (overrides = {}) => ({ ...newTransactionDraft("USD", "2026-01-01T00:00"), amount: "100", ...overrides });

describe("transaction currency couplings", () => {
  it("requires an account amount only when the account currency differs", () => {
    expect(differingCurrency(draft({ accountId: "mxn" }), accounts, draft({ accountId: "mxn" }).accountId)).toBe("MXN");
    expect(differingCurrency(draft({ accountId: "usd" }), accounts, draft({ accountId: "usd" }).accountId)).toBeNull();
    expect(differingCurrency(draft(), accounts, draft().accountId)).toBeNull();
  });

  it("requires a received amount only for a transfer to a different currency", () => {
    const transfer = draft({ type: "transfer", accountId: "usd", transferToAccountId: "mxn" });
    expect(differingCurrency(transfer, accounts, destinationAccountId(transfer))).toBe("MXN");
    expect(differingCurrency(transfer, accounts, destinationAccountId({ ...transfer, transferToAccountId: "usd" }))).toBeNull();
    expect(differingCurrency(transfer, accounts, destinationAccountId({ ...transfer, type: "expense" }))).toBeNull();
  });

  it("offers execution and destination currencies for the fee, and only when a currency differs", () => {
    const transfer = draft({ type: "transfer", accountId: "usd", transferToAccountId: "mxn" });
    expect(feeApplies(transfer, accounts)).toBe(true);
    expect(feeCurrencyOptions(transfer, accounts)).toEqual(["USD", "MXN"]);
    expect(feeApplies(draft({ accountId: "usd" }), accounts)).toBe(false);
  });

  it("clears hidden fields when the couplings stop applying, keeps visible ones", () => {
    const filled = draft({
      type: "transfer",
      accountId: "usd",
      transferToAccountId: "usd",
      accountAmount: "5",
      destinationAmount: "1700",
      feeAmount: "2",
      feeCurrency: "USD"
    });
    expect(reconcileCurrencyFields({ ...filled, transferToAccountId: "usd" }, accounts)).toMatchObject({
      accountAmount: "",
      destinationAmount: "",
      feeAmount: "",
      feeCurrency: ""
    });
    const cross = { ...filled, transferToAccountId: "mxn", accountAmount: "", feeCurrency: "EUR" };
    expect(reconcileCurrencyFields(cross, accounts)).toMatchObject({
      destinationAmount: "1700",
      feeAmount: "2",
      feeCurrency: ""
    });
  });

  it("returns the same draft when nothing changes or no accounts are known", () => {
    const d = draft({ accountId: "usd" });
    expect(reconcileCurrencyFields(d, accounts)).toBe(d);
    expect(reconcileCurrencyFields(draft({ accountAmount: "5" }), [])).toMatchObject({ accountAmount: "5" });
  });
});
