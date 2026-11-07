import { describe, expect, it } from "vitest";
import { withVisibleTransaction } from "../transactionVisibility.js";

const sharedExpense = {
  ownerUserId: "owner",
  transaction: {
    id: "t1",
    name: "Dinner",
    amount: 100,
    executionCurrency: "MXN",
    type: "expense",
    date: "2026-01-01",
    categoryId: "c1",
    expenseOffsetCategoryId: null,
    groupId: "g1",
    accountId: "secret-account",
    notes: "private note",
    exchangeRate: 17,
    userId: "owner"
  }
};

describe("withVisibleTransaction", () => {
  it("returns the full transaction to its owner", () => {
    expect(withVisibleTransaction(sharedExpense, "owner")).toBe(sharedExpense);
  });

  it("returns only the public fields to anyone else", () => {
    const visible = withVisibleTransaction(sharedExpense, "participant").transaction;

    expect(visible).toEqual({
      id: "t1",
      name: "Dinner",
      amount: 100,
      executionCurrency: "MXN",
      type: "expense",
      date: "2026-01-01",
      categoryId: "c1",
      expenseOffsetCategoryId: null,
      groupId: "g1"
    });
  });

  it("passes through a shared expense with no transaction", () => {
    const noTransaction = { ownerUserId: "owner", transaction: null };

    expect(withVisibleTransaction(noTransaction, "participant")).toBe(noTransaction);
  });
});
