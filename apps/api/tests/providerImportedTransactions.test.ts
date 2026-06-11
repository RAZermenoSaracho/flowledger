import assert from "node:assert/strict";

const {
  batchIgnoreProviderImportedTransactionsSchema,
  batchImportProviderImportedTransactionsSchema,
  importProviderImportedTransactionSchema,
  providerImportedTransactionFiltersSchema,
  updateProviderImportedTransactionSchema
} = await import("@flowledger/shared");

assert.equal(
  providerImportedTransactionFiltersSchema.parse({ status: "pending" }).status,
  "pending"
);
assert.equal(
  providerImportedTransactionFiltersSchema.parse({ status: "processed" })
    .status,
  "processed"
);
assert.equal(
  providerImportedTransactionFiltersSchema.parse({ status: "ignored" }).status,
  "ignored"
);
assert.throws(() =>
  providerImportedTransactionFiltersSchema.parse({ status: "not_ignored" })
);

assert.deepEqual(
  updateProviderImportedTransactionSchema.parse({ categoryId: null }),
  { categoryId: null }
);
assert.deepEqual(importProviderImportedTransactionSchema.parse({}), {});
assert.deepEqual(
  importProviderImportedTransactionSchema.parse({ categoryId: "category_1" }),
  { categoryId: "category_1" }
);

assert.deepEqual(
  batchImportProviderImportedTransactionsSchema.parse({
    selection: { mode: "ids", ids: ["imported_1"] },
    categoryId: "category_1"
  }),
  {
    selection: { mode: "ids", ids: ["imported_1"] },
    categoryId: "category_1"
  }
);

assert.deepEqual(
  batchIgnoreProviderImportedTransactionsSchema.parse({
    selection: {
      mode: "filtered",
      filters: { status: "pending", provider: "syncfy" }
    }
  }),
  {
    selection: {
      mode: "filtered",
      filters: { status: "pending", provider: "syncfy" }
    }
  }
);
