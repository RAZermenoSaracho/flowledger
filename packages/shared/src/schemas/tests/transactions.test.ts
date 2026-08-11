import { describe, expect, it } from "vitest";
import {
  batchIgnoreProviderImportedTransactionsSchema,
  batchImportProviderImportedTransactionsSchema,
  batchUnignoreProviderImportedTransactionsSchema,
  classificationSchema,
  importProviderImportedTransactionSchema,
  importedTransactionsQueryParamSchema,
  transactionFilterTypeSchema,
  transactionSchema,
  transactionsQueryParamSchema,
  updateProviderImportedTransactionSchema,
  updateTransactionSchema
} from "../transactions.js";

const baseIncome = {
  name: "Paycheck",
  amount: 1000,
  type: "income" as const,
  date: "2024-01-15"
};

const baseTransfer = {
  name: "Move funds",
  amount: 100,
  type: "transfer" as const,
  date: "2024-01-15"
};

describe("transactionSchema — income/expense", () => {
  it("accepts a minimal valid income transaction", () => {
    expect(transactionSchema.safeParse(baseIncome).success).toBe(true);
  });

  it("accepts an income transaction with a shared expense", () => {
    expect(
      transactionSchema.safeParse({
        ...baseIncome,
        sharedExpense: {
          title: "Split rent",
          participants: [{ participantName: "Sam", shareAmount: 500 }]
        }
      }).success
    ).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(
      transactionSchema.safeParse({ ...baseIncome, name: "" }).success
    ).toBe(false);
  });

  it("rejects an unknown transaction type", () => {
    expect(
      transactionSchema.safeParse({ ...baseIncome, type: "loan" }).success
    ).toBe(false);
  });
});

describe("transactionSchema — transfer", () => {
  const validTransfer = {
    ...baseTransfer,
    accountId: "acc-1",
    transferToAccountId: "acc-2"
  };

  it("accepts a valid transfer with distinct from/to accounts", () => {
    expect(transactionSchema.safeParse(validTransfer).success).toBe(true);
  });

  it("rejects a transfer missing accountId", () => {
    const { accountId: _accountId, ...withoutFrom } = validTransfer;
    const result = transactionSchema.safeParse(withoutFrom);
    expect(result.success).toBe(false);
  });

  it("rejects a transfer missing transferToAccountId", () => {
    const { transferToAccountId: _to, ...withoutTo } = validTransfer;
    expect(transactionSchema.safeParse(withoutTo).success).toBe(false);
  });

  it("rejects a transfer with identical from/to accounts", () => {
    expect(
      transactionSchema.safeParse({
        ...validTransfer,
        transferToAccountId: "acc-1"
      }).success
    ).toBe(false);
  });

  it("rejects a transfer with a categoryId", () => {
    expect(
      transactionSchema.safeParse({ ...validTransfer, categoryId: "cat-1" })
        .success
    ).toBe(false);
  });

  it("rejects a transfer with a groupId", () => {
    expect(
      transactionSchema.safeParse({ ...validTransfer, groupId: "group-1" })
        .success
    ).toBe(false);
  });

  it("rejects a transfer with an expenseOffsetCategoryId", () => {
    expect(
      transactionSchema.safeParse({
        ...validTransfer,
        expenseOffsetCategoryId: "cat-1"
      }).success
    ).toBe(false);
  });

  it("rejects a transfer with a sharedExpense", () => {
    expect(
      transactionSchema.safeParse({
        ...validTransfer,
        sharedExpense: {
          title: "Split",
          participants: [{ participantName: "Sam", shareAmount: 50 }]
        }
      }).success
    ).toBe(false);
  });

  it("rejects a non-transfer transaction that sets transferToAccountId", () => {
    expect(
      transactionSchema.safeParse({
        ...baseIncome,
        transferToAccountId: "acc-2"
      }).success
    ).toBe(false);
  });
});

describe("updateTransactionSchema", () => {
  it("accepts a partial update with a single field", () => {
    expect(updateTransactionSchema.safeParse({ name: "Renamed" }).success).toBe(
      true
    );
  });

  it("accepts an empty object", () => {
    expect(updateTransactionSchema.safeParse({}).success).toBe(true);
  });

  it("does not apply the transfer superRefine (omits sharedExpense, no cross-field rules)", () => {
    expect(
      updateTransactionSchema.safeParse({ type: "transfer" }).success
    ).toBe(true);
  });
});

describe("query param schemas", () => {
  it("transactionsQueryParamSchema accepts an empty object", () => {
    expect(transactionsQueryParamSchema.safeParse({}).success).toBe(true);
  });

  it("importedTransactionsQueryParamSchema accepts an empty object", () => {
    expect(importedTransactionsQueryParamSchema.safeParse({}).success).toBe(
      true
    );
  });

  it("transactionFilterTypeSchema accepts a known filter type", () => {
    expect(transactionFilterTypeSchema.safeParse("settlement").success).toBe(
      true
    );
  });

  it("transactionFilterTypeSchema rejects an unknown filter type", () => {
    expect(transactionFilterTypeSchema.safeParse("bogus").success).toBe(false);
  });

  it("classificationSchema accepts 'complete' and 'needsClassification'", () => {
    expect(classificationSchema.safeParse("complete").success).toBe(true);
    expect(classificationSchema.safeParse("needsClassification").success).toBe(
      true
    );
  });
});

describe("provider imported transaction schemas", () => {
  it("updateProviderImportedTransactionSchema accepts a null categoryId (unassign)", () => {
    expect(
      updateProviderImportedTransactionSchema.safeParse({ categoryId: null })
        .success
    ).toBe(true);
  });

  it("updateProviderImportedTransactionSchema rejects a missing categoryId", () => {
    expect(
      updateProviderImportedTransactionSchema.safeParse({}).success
    ).toBe(false);
  });

  it("importProviderImportedTransactionSchema accepts an empty object", () => {
    expect(
      importProviderImportedTransactionSchema.safeParse({}).success
    ).toBe(true);
  });

  it("batchImportProviderImportedTransactionsSchema accepts an 'ids' selection", () => {
    expect(
      batchImportProviderImportedTransactionsSchema.safeParse({
        selection: { mode: "ids", ids: ["it-1"] }
      }).success
    ).toBe(true);
  });

  it("batchImportProviderImportedTransactionsSchema accepts a 'filtered' selection", () => {
    expect(
      batchImportProviderImportedTransactionsSchema.safeParse({
        selection: { mode: "filtered", where: { status: "pending" } }
      }).success
    ).toBe(true);
  });

  it("batchImportProviderImportedTransactionsSchema rejects an 'ids' selection with an empty ids array", () => {
    expect(
      batchImportProviderImportedTransactionsSchema.safeParse({
        selection: { mode: "ids", ids: [] }
      }).success
    ).toBe(false);
  });

  it("batchIgnoreProviderImportedTransactionsSchema accepts a valid selection", () => {
    expect(
      batchIgnoreProviderImportedTransactionsSchema.safeParse({
        selection: { mode: "ids", ids: ["it-1"] }
      }).success
    ).toBe(true);
  });

  it("batchUnignoreProviderImportedTransactionsSchema accepts a valid selection", () => {
    expect(
      batchUnignoreProviderImportedTransactionsSchema.safeParse({
        selection: { mode: "ids", ids: ["it-1"] }
      }).success
    ).toBe(true);
  });

  it("rejects an unknown selection mode", () => {
    expect(
      batchIgnoreProviderImportedTransactionsSchema.safeParse({
        selection: { mode: "all" }
      }).success
    ).toBe(false);
  });
});
