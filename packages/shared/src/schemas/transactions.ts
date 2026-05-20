import { z } from "zod";
import { TRANSACTION_TYPES } from "../constants/index.js";
import { moneySchema, optionalDateStringSchema } from "./common.js";

export const transactionSchema = z.object({
  name: z.string().trim().min(1).max(160),
  amount: moneySchema,
  type: z.enum(TRANSACTION_TYPES),
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  categoryId: z.string().min(1).optional().nullable(),
  accountId: z.string().min(1).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable()
});

export const updateTransactionSchema = transactionSchema.partial();

export const transactionFiltersSchema = z.object({
  dateFrom: optionalDateStringSchema,
  dateTo: optionalDateStringSchema,
  categoryId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  search: z.string().trim().max(120).optional()
});

export type TransactionInput = z.infer<typeof transactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type TransactionFilters = z.infer<typeof transactionFiltersSchema>;
