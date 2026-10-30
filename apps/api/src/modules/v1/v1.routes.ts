import {
  accountSchema,
  accountsQueryParamSchema,
  categoriesQueryParamSchema,
  categorySchema,
  currencyRateQuerySchema,
  importedTransactionsQueryParamSchema,
  reportFiltersSchema,
  transactionSchema,
  transactionsQueryParamSchema,
  updateAccountSchema,
  updateCategorySchema,
  updateTransactionSchema
} from "@flowledger/shared";
import { Router } from "express";
import { requireCredential, requireScope } from "../../middleware/credential.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { notFound } from "../../utils/httpError.js";
import { createRateLimiter } from "../../utils/rateLimit.js";
import { postAccount } from "../accounts/controllers/create.controller.js";
import { getAccounts } from "../accounts/controllers/read.controller.js";
import { deleteAccountHandler } from "../accounts/controllers/delete.controller.js";
import {
  postArchiveAccount,
  postRestoreAccount,
  putAccount
} from "../accounts/controllers/update.controller.js";
import { postCategory } from "../categories/controllers/create.controller.js";
import { getCategories } from "../categories/controllers/read.controller.js";
import { deleteCategoryController } from "../categories/controllers/delete.controller.js";
import {
  postCategoryArchive,
  postCategoryRestore,
  putCategory
} from "../categories/controllers/update.controller.js";
import { getCurrencies, getRate } from "../currencies/controllers/read.controller.js";
import { getNotifications } from "../notifications/controllers/read.controller.js";
import {
  getByCategory,
  getMonthlyCashflow,
  getSummary
} from "../reports/controllers/read.controller.js";
import { deleteTransactionHandler } from "../transactions/controllers/delete.controller.js";
import { postTransaction } from "../transactions/controllers/create.controller.js";
import {
  getTransaction,
  getTransactions,
  getTransactionsSummaryHandler
} from "../transactions/controllers/read.controller.js";
import { putTransaction } from "../transactions/controllers/update.controller.js";
import { getV1Debts, getV1ImportedTransactions } from "./controllers/v1.controller.js";
import { v1GroupsRouter } from "./v1.groups.routes.js";
import { v1MiscRouter } from "./v1.misc.routes.js";
import { auditV1Write } from "./utils/v1Audit.js";
import { clampV1Pagination } from "./utils/v1Pagination.js";

/**
 * Router for the public `/v1` API: API-key auth only, an explicit allowlist of
 * 26 routes plus the 13 group/shared-expense/settlement routes of `v1GroupsRouter` and the 12 imported-review/notification/profile routes of `v1MiscRouter`, reusing the internal validators and controllers, and a JSON 404 for
 * everything else (deny by default).
 */
export const v1Router = Router();

v1Router.use(createRateLimiter({ windowMs: 60_000, limit: 120 }));
v1Router.use(requireCredential);

v1Router.get(
  "/accounts",
  requireScope("read"),
  validate(accountsQueryParamSchema, "query"),
  asyncHandler(getAccounts)
);
v1Router.get(
  "/categories",
  requireScope("read"),
  validate(categoriesQueryParamSchema, "query"),
  asyncHandler(getCategories)
);
v1Router.get(
  "/transactions/summary",
  requireScope("read"),
  validate(transactionsQueryParamSchema, "query"),
  asyncHandler(getTransactionsSummaryHandler)
);
v1Router.get(
  "/transactions",
  requireScope("read"),
  validate(transactionsQueryParamSchema, "query"),
  clampV1Pagination,
  asyncHandler(getTransactions)
);
v1Router.get("/transactions/:id", requireScope("read"), asyncHandler(getTransaction));
v1Router.post(
  "/transactions",
  auditV1Write("transaction.create"),
  requireScope("write"),
  validate(transactionSchema),
  asyncHandler(postTransaction)
);
v1Router.put(
  "/transactions/:id",
  auditV1Write("transaction.update"),
  requireScope("write"),
  validate(updateTransactionSchema),
  asyncHandler(putTransaction)
);

v1Router.delete(
  "/accounts/:id",
  auditV1Write("account.delete"),
  requireScope("write"),
  asyncHandler(deleteAccountHandler)
);
v1Router.delete(
  "/categories/:id",
  auditV1Write("category.delete"),
  requireScope("write"),
  asyncHandler(deleteCategoryController)
);
v1Router.delete(
  "/transactions/:id",
  auditV1Write("transaction.delete"),
  requireScope("write"),
  asyncHandler(deleteTransactionHandler)
);

v1Router.get("/debts", requireScope("read"), asyncHandler(getV1Debts));
v1Router.get(
  "/reports/summary",
  requireScope("read"),
  validate(reportFiltersSchema, "query"),
  asyncHandler(getSummary)
);
v1Router.get(
  "/reports/by-category",
  requireScope("read"),
  validate(reportFiltersSchema, "query"),
  asyncHandler(getByCategory)
);
v1Router.get(
  "/reports/monthly-cashflow",
  requireScope("read"),
  validate(reportFiltersSchema, "query"),
  asyncHandler(getMonthlyCashflow)
);
v1Router.get("/currencies", requireScope("read"), asyncHandler(getCurrencies));
v1Router.get(
  "/currencies/rate",
  requireScope("read"),
  validate(currencyRateQuerySchema, "query"),
  asyncHandler(getRate)
);
v1Router.get("/notifications", requireScope("read"), asyncHandler(getNotifications));
v1Router.get(
  "/imported-transactions",
  requireScope("read"),
  validate(importedTransactionsQueryParamSchema, "query"),
  asyncHandler(getV1ImportedTransactions)
);

v1Router.post(
  "/accounts",
  auditV1Write("account.create"),
  requireScope("write"),
  validate(accountSchema),
  asyncHandler(postAccount)
);
v1Router.put(
  "/accounts/:id",
  auditV1Write("account.update"),
  requireScope("write"),
  validate(updateAccountSchema),
  asyncHandler(putAccount)
);
v1Router.post(
  "/accounts/:id/archive",
  auditV1Write("account.archive"),
  requireScope("write"),
  asyncHandler(postArchiveAccount)
);
v1Router.post(
  "/accounts/:id/restore",
  auditV1Write("account.restore"),
  requireScope("write"),
  asyncHandler(postRestoreAccount)
);

v1Router.post(
  "/categories",
  auditV1Write("category.create"),
  requireScope("write"),
  validate(categorySchema),
  asyncHandler(postCategory)
);
v1Router.put(
  "/categories/:id",
  auditV1Write("category.update"),
  requireScope("write"),
  validate(updateCategorySchema),
  asyncHandler(putCategory)
);
v1Router.post(
  "/categories/:id/archive",
  auditV1Write("category.archive"),
  requireScope("write"),
  asyncHandler(postCategoryArchive)
);
v1Router.post(
  "/categories/:id/restore",
  auditV1Write("category.restore"),
  requireScope("write"),
  asyncHandler(postCategoryRestore)
);

v1Router.use(v1MiscRouter);
v1Router.use(v1GroupsRouter);

v1Router.use((_req, _res, next) => next(notFound("Route")));
