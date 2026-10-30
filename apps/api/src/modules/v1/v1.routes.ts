import {
  accountsQueryParamSchema,
  categoriesQueryParamSchema,
  transactionSchema,
  transactionsQueryParamSchema,
  updateTransactionSchema
} from "@flowledger/shared";
import { Router } from "express";
import { requireCredential, requireScope } from "../../middleware/credential.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { notFound } from "../../utils/httpError.js";
import { createRateLimiter } from "../../utils/rateLimit.js";
import { getAccounts } from "../accounts/controllers/read.controller.js";
import { getCategories } from "../categories/controllers/read.controller.js";
import { postTransaction } from "../transactions/controllers/create.controller.js";
import {
  getTransaction,
  getTransactions,
  getTransactionsSummaryHandler
} from "../transactions/controllers/read.controller.js";
import { putTransaction } from "../transactions/controllers/update.controller.js";
import { auditV1Write } from "./utils/v1Audit.js";
import { clampV1Pagination } from "./utils/v1Pagination.js";

/**
 * Router for the public `/v1` API: API-key auth only, an explicit allowlist of
 * 7 routes reusing the internal validators and controllers, and a JSON 404 for
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

v1Router.use((_req, _res, next) => next(notFound("Route")));
