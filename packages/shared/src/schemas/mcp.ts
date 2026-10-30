import { z } from "zod";
import { TRANSACTION_TYPES } from "../constants/index.js";
import { updateTransactionSchema } from "./transactions.js";

const isoDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Structured filter accepted by the MCP `search_transactions` tool; strict so unknown keys are rejected instead of silently ignored. */
export const transactionSearchFilterSchema = z
  .object({
    dateFrom: isoDaySchema.optional(),
    dateTo: isoDaySchema.optional(),
    accountId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    text: z.string().trim().min(1).max(100).optional(),
    type: z.enum(TRANSACTION_TYPES).optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(50)
  })
  .strict();

/** Filter for the MCP `get_transaction_summary` tool: the search filter without paging. */
export const transactionSummaryFilterSchema = transactionSearchFilterSchema.omit({
  page: true,
  pageSize: true
});

/** Input of the MCP `update_transaction` tool: the web update fields plus the target transaction `id`. */
export const updateTransactionToolSchema = updateTransactionSchema.extend({
  id: z.string().min(1)
});

export type TransactionSearchFilter = z.infer<typeof transactionSearchFilterSchema>;
export type TransactionSummaryFilter = z.infer<typeof transactionSummaryFilterSchema>;
