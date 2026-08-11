import { describe, expect, it } from "vitest";
import type { Account } from "../../../../types/accounts.types";
import type { Category } from "../../../../types/categories.types";
import {
  buildImportedTransactionSearchFields,
  IMPORTED_TRANSACTION_DEFAULT_SEARCH_FIELD
} from "../importedTransactionSearchFields";

const account: Account = {
  id: "acc-1",
  name: "Checking",
  type: "checking",
  currency: "USD",
  initialBalance: 0,
  isArchived: false,
  createdAt: "",
  updatedAt: ""
};
const category: Category = {
  id: "cat-1",
  name: "Groceries",
  type: "expense",
  isArchived: false,
  createdAt: "",
  updatedAt: ""
};

describe("buildImportedTransactionSearchFields", () => {
  it("includes the virtual 'search' field fixed to the 'ilike' operator", () => {
    const searchField = buildImportedTransactionSearchFields({
      accounts: [],
      categories: [],
      providerAccountOptions: []
    }).find((f) => f.name === "search");
    expect(searchField?.ops).toEqual(["ilike"]);
  });

  it("populates the status field's options from PROVIDER_IMPORTED_TRANSACTION_STATUSES", () => {
    const statusField = buildImportedTransactionSearchFields({
      accounts: [],
      categories: [],
      providerAccountOptions: []
    }).find((f) => f.name === "status");
    expect(statusField?.options?.length).toBeGreaterThan(0);
  });

  it("populates the linked-account field's options from the given accounts", () => {
    const field = buildImportedTransactionSearchFields({
      accounts: [account],
      categories: [],
      providerAccountOptions: []
    }).find((f) => f.name === "providerAccount.accountId");
    expect(field?.options).toEqual([{ label: "Checking", value: "acc-1" }]);
  });

  it("populates the category field's options from the given categories", () => {
    const field = buildImportedTransactionSearchFields({
      accounts: [],
      categories: [category],
      providerAccountOptions: []
    }).find((f) => f.name === "categoryId");
    expect(field?.options).toEqual([{ label: "Groceries", value: "cat-1" }]);
  });

  it("expands 'providerAccountLink' into providerAccountRefId/providerAccountId", () => {
    const field = buildImportedTransactionSearchFields({
      accounts: [],
      categories: [],
      providerAccountOptions: [{ id: "pa-1", label: "Chase •••1234" }]
    }).find((f) => f.name === "providerAccountLink");
    expect(field?.expandsToFields).toEqual(["providerAccountRefId", "providerAccountId"]);
    expect(field?.options).toEqual([{ label: "Chase •••1234", value: "pa-1" }]);
  });

  it("targets 'search' as the default quick-search field", () => {
    expect(IMPORTED_TRANSACTION_DEFAULT_SEARCH_FIELD).toBe("search");
  });
});
