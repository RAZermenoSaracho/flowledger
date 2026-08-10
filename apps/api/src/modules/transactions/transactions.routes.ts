import {
  batchIgnoreProviderImportedTransactionsSchema,
  batchImportProviderImportedTransactionsSchema,
  batchUnignoreProviderImportedTransactionsSchema,
  importedTransactionsQueryParamSchema,
  importProviderImportedTransactionSchema,
  transactionSchema,
  transactionsQueryParamSchema,
  updateProviderImportedTransactionSchema,
  updateTransactionSchema
} from "@flowledger/shared";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  postBatchImport,
  postImportedTransactionImport,
  postTransaction
} from "./controllers/create.controller.js";
import { deleteTransactionHandler } from "./controllers/delete.controller.js";
import {
  getImportedTransactions,
  getImportedTransactionsPendingCountHandler,
  getTransaction,
  getTransactions,
  getTransactionsSummaryHandler
} from "./controllers/read.controller.js";
import {
  patchImportedTransaction,
  postBatchIgnore,
  postBatchUnignore,
  postIgnoreImportedTransaction,
  postUnignoreImportedTransaction,
  putTransaction
} from "./controllers/update.controller.js";

/** Router for `/transactions` — CRUD, summary, and the imported-transactions review/batch-action endpoints. */
export const transactionsRouter = Router();

transactionsRouter.get(
  "/imported",
  validate(importedTransactionsQueryParamSchema, "query"),
  asyncHandler(getImportedTransactions)
);

transactionsRouter.get(
  "/imported/pending-count",
  asyncHandler(getImportedTransactionsPendingCountHandler)
);

transactionsRouter.patch(
  "/imported/:id",
  validate(updateProviderImportedTransactionSchema),
  asyncHandler(patchImportedTransaction)
);

transactionsRouter.post(
  "/imported/:id/import",
  validate(importProviderImportedTransactionSchema),
  asyncHandler(postImportedTransactionImport)
);

transactionsRouter.post(
  "/imported/:id/ignore",
  asyncHandler(postIgnoreImportedTransaction)
);

transactionsRouter.post(
  "/imported/:id/unignore",
  asyncHandler(postUnignoreImportedTransaction)
);

transactionsRouter.post(
  "/imported/batch-import",
  validate(batchImportProviderImportedTransactionsSchema),
  asyncHandler(postBatchImport)
);

transactionsRouter.post(
  "/imported/batch-ignore",
  validate(batchIgnoreProviderImportedTransactionsSchema),
  asyncHandler(postBatchIgnore)
);

transactionsRouter.post(
  "/imported/batch-unignore",
  validate(batchUnignoreProviderImportedTransactionsSchema),
  asyncHandler(postBatchUnignore)
);

transactionsRouter.get(
  "/summary",
  validate(transactionsQueryParamSchema, "query"),
  asyncHandler(getTransactionsSummaryHandler)
);

transactionsRouter.get(
  "/",
  validate(transactionsQueryParamSchema, "query"),
  asyncHandler(getTransactions)
);

transactionsRouter.post(
  "/",
  validate(transactionSchema),
  asyncHandler(postTransaction)
);

transactionsRouter.get("/:id", asyncHandler(getTransaction));

transactionsRouter.put(
  "/:id",
  validate(updateTransactionSchema),
  asyncHandler(putTransaction)
);

transactionsRouter.delete("/:id", asyncHandler(deleteTransactionHandler));
