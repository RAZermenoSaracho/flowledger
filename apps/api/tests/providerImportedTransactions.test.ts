import assert from "node:assert/strict";

const {
  batchIgnoreProviderImportedTransactionsSchema,
  batchImportProviderImportedTransactionsSchema,
  importProviderImportedTransactionSchema,
  updateProviderImportedTransactionSchema
} = await import("@flowledger/shared");

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
      where: { field: "status", op: "=", value: "pending" }
    }
  }),
  {
    selection: {
      mode: "filtered",
      where: { field: "status", op: "=", value: "pending" }
    }
  }
);
