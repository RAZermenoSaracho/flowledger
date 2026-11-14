import { describe, expect, it } from "vitest";
import type { Account } from "../../../../types/accounts.types";
import { cardEntryOptions, reconcileCardEntry, selectCardEntry } from "../creditCardEntry";
import { newTransactionDraft } from "../transactionDraft";
import { changeType } from "../transactionDraftReducers";

const accounts = [
  { id: "card", name: "Visa", type: "credit_card", currency: "MXN" },
  { id: "chk", name: "Checking", type: "checking", currency: "MXN" }
] as Account[];

const base = newTransactionDraft("MXN", "2027-01-01T10:00");

describe("card entry coupling", () => {
  it("offers income choices on a card, expense choices on a card, none elsewhere", () => {
    const income = cardEntryOptions({ ...base, type: "income", accountId: "card" }, accounts);
    expect(income?.map((option) => option.label)).toEqual(["Payment", "Refund", "Cashback", "Other credit"]);
    const expense = cardEntryOptions({ ...base, type: "expense", accountId: "card" }, accounts);
    expect(expense?.map((option) => option.label)).toEqual(["Interest", "Charge"]);
    expect(cardEntryOptions({ ...base, type: "income", accountId: "chk" }, accounts)).toBeNull();
    expect(cardEntryOptions({ ...base, type: "transfer", accountId: "card" }, accounts)).toBeNull();
  });

  it("clears the kind when the account is no longer a card", () => {
    const draft = { ...base, type: "income" as const, accountId: "chk", creditCardKind: "payment" as const };
    expect(reconcileCardEntry(draft, accounts).creditCardKind).toBe("");
  });

  it("clears the kind when the type no longer fits", () => {
    const draft = { ...base, type: "expense" as const, accountId: "card", creditCardKind: "payment" as const };
    expect(reconcileCardEntry(draft, accounts).creditCardKind).toBe("");
  });

  it("keeps a fitting kind unchanged", () => {
    const draft = { ...base, type: "expense" as const, accountId: "card", creditCardKind: "interest" as const };
    expect(reconcileCardEntry(draft, accounts)).toBe(draft);
  });

  it("clears the refunded category when leaving refund", () => {
    const refund = { ...base, type: "income" as const, accountId: "card", creditCardKind: "refund" as const, expenseOffsetCategoryId: "c1" };
    expect(selectCardEntry(refund, "payment").expenseOffsetCategoryId).toBe("");
    expect(reconcileCardEntry({ ...refund, accountId: "chk" }, accounts)).toMatchObject({
      creditCardKind: "",
      expenseOffsetCategoryId: ""
    });
  });

  it("does not touch an unrelated expense offset category", () => {
    const draft = { ...base, type: "income" as const, accountId: "chk", expenseOffsetCategoryId: "c1" };
    expect(reconcileCardEntry(draft, accounts)).toBe(draft);
  });

  it("choosing transfer clears the card entry", () => {
    const draft = { ...base, type: "income" as const, accountId: "card", creditCardKind: "payment" as const };
    expect(changeType(draft, "transfer", []).creditCardKind).toBe("");
  });
});
