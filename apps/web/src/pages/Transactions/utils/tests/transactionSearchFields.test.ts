import { describe, expect, it } from "vitest";
import {
  buildTransactionSearchFields,
  TRANSACTION_DEFAULT_SEARCH_FIELD,
  TRANSACTION_GROUPABLE_FIELDS,
  TRANSACTION_SORTABLE_FIELDS
} from "../transactionSearchFields";

const options = {
  accounts: [{ id: "acc-1", name: "Checking" }],
  categories: [{ id: "cat-1", name: "Groceries" }],
  groups: [{ id: "group-1", name: "Roommates" }],
  currencyOptions: ["USD", "EUR"]
};

describe("buildTransactionSearchFields", () => {
  it("includes every real column plus the two virtual fields", () => {
    const names = buildTransactionSearchFields(options).map((field) => field.name);
    expect(names).toContain("name");
    expect(names).toContain("classification");
    expect(names).toContain("transactionFilterType");
  });

  it("populates account/category/group options from the given lists", () => {
    const fields = buildTransactionSearchFields(options);
    expect(fields.find((f) => f.name === "accountId")?.options).toEqual([
      { label: "Checking", value: "acc-1" }
    ]);
    expect(fields.find((f) => f.name === "transferToAccountId")?.options).toEqual([
      { label: "Checking", value: "acc-1" }
    ]);
    expect(fields.find((f) => f.name === "categoryId")?.options).toEqual([
      { label: "Groceries", value: "cat-1" }
    ]);
    expect(fields.find((f) => f.name === "groupId")?.options).toEqual([
      { label: "Roommates", value: "group-1" }
    ]);
  });

  it("populates the currency field's options from currencyOptions", () => {
    const currencyField = buildTransactionSearchFields(options).find(
      (f) => f.name === "executionCurrency"
    );
    expect(currencyField?.options).toEqual([
      { label: "USD", value: "USD" },
      { label: "EUR", value: "EUR" }
    ]);
  });

  it("populates the type field's options from TRANSACTION_TYPES", () => {
    const typeField = buildTransactionSearchFields(options).find((f) => f.name === "type");
    expect(typeField?.options?.length).toBeGreaterThan(0);
  });

  it("gives the virtual classification/transactionFilterType fields fixed option sets", () => {
    const fields = buildTransactionSearchFields(options);
    expect(fields.find((f) => f.name === "classification")?.options).toEqual([
      { label: "Complete", value: "complete" },
      { label: "Needs classification", value: "needsClassification" }
    ]);
    expect(fields.find((f) => f.name === "transactionFilterType")?.options).toEqual([
      { label: "Normal transactions", value: "normal" },
      { label: "Settlement transactions", value: "settlement" },
      { label: "Expense reimbursement/offset transactions", value: "expenseOffset" }
    ]);
  });
});

describe("transaction search field constants", () => {
  it("exposes category/account/month as groupable fields", () => {
    expect(TRANSACTION_GROUPABLE_FIELDS.map((f) => f.name)).toEqual([
      "category",
      "account",
      "month"
    ]);
  });

  it("exposes date/name/amount/createdAt as sortable fields", () => {
    expect(TRANSACTION_SORTABLE_FIELDS.map((f) => f.name)).toEqual([
      "date",
      "name",
      "amount",
      "createdAt"
    ]);
  });

  it("targets 'name' as the default quick-search field", () => {
    expect(TRANSACTION_DEFAULT_SEARCH_FIELD).toBe("name");
  });
});
