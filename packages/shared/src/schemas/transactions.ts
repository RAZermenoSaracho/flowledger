import { z } from "zod";
import {
  PROVIDER_IMPORTED_TRANSACTION_STATUSES,
  TRANSACTION_FILTER_TYPES,
  TRANSACTION_TYPES
} from "../constants/index.js";
import { moneySchema, optionalDateStringSchema } from "./common.js";
import { sharedExpenseParticipantSchema } from "./sharedExpenses.js";

export const transactionSharedExpenseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  participants: z.array(sharedExpenseParticipantSchema).min(1)
});

const baseTransactionSchema = z.object({
  name: z.string().trim().min(1).max(160),
  amount: moneySchema,
  type: z.enum(TRANSACTION_TYPES),
  date: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  categoryId: z.string().min(1).optional().nullable(),
  expenseOffsetCategoryId: z.string().min(1).optional().nullable(),
  groupId: z.string().min(1).optional().nullable(),
  accountId: z.string().min(1).optional().nullable(),
  transferToAccountId: z.string().min(1).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  sharedExpense: transactionSharedExpenseSchema.optional()
});

export const transactionSchema = baseTransactionSchema.superRefine(
  (transaction, ctx) => {
    if (transaction.type === "transfer" && transaction.sharedExpense) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sharedExpense"],
        message:
          "Shared transactions are only supported for income and expense transactions"
      });
    }

    if (transaction.type === "transfer") {
      if (!transaction.accountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["accountId"],
          message: "From account is required for transfers"
        });
      }

      if (!transaction.transferToAccountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferToAccountId"],
          message: "To account is required for transfers"
        });
      }

      if (
        transaction.accountId &&
        transaction.transferToAccountId &&
        transaction.accountId === transaction.transferToAccountId
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferToAccountId"],
          message: "Source and destination accounts must be different"
        });
      }

      if (transaction.categoryId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["categoryId"],
          message: "Transfers cannot have a category"
        });
      }

      if (transaction.groupId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["groupId"],
          message: "Transfers cannot belong to a group"
        });
      }

      if (transaction.expenseOffsetCategoryId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["expenseOffsetCategoryId"],
          message: "Transfers cannot have expense offsets"
        });
      }
    }

    if (transaction.type !== "transfer" && transaction.transferToAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transferToAccountId"],
        message: "Destination account is only supported for transfers"
      });
    }
  }
);

export const updateTransactionSchema = baseTransactionSchema
  .omit({ sharedExpense: true })
  .partial();

export const transactionFiltersSchema = z.object({
  dateFrom: optionalDateStringSchema,
  dateTo: optionalDateStringSchema,
  amountFrom: moneySchema.optional(),
  amountTo: moneySchema.optional(),
  categoryId: z.string().min(1).optional(),
  groupId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  transactionFilterType: z.enum(TRANSACTION_FILTER_TYPES).optional(),
  classification: z.enum(["complete", "needsClassification"]).optional(),
  search: z.string().trim().max(120).optional()
});

export const providerImportedTransactionFiltersSchema = z.object({
  status: z.enum(PROVIDER_IMPORTED_TRANSACTION_STATUSES).optional(),
  search: z.string().trim().max(120).optional(),
  provider: z.string().trim().max(80).optional(),
  accountId: z.string().min(1).optional(),
  providerAccountId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  dateFrom: optionalDateStringSchema,
  dateTo: optionalDateStringSchema,
  amountFrom: moneySchema.optional(),
  amountTo: moneySchema.optional(),
  sortBy: z
    .enum(["transactionDate", "amount", "description", "provider", "status"])
    .optional(),
  sortDirection: z.enum(["asc", "desc"]).optional()
});

export const updateProviderImportedTransactionSchema = z.object({
  categoryId: z.string().min(1).nullable()
});

export const importProviderImportedTransactionSchema = z.object({
  categoryId: z.string().min(1).optional()
});

const importedTransactionSelectionSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("ids"),
    ids: z.array(z.string().min(1)).min(1)
  }),
  z.object({
    mode: z.literal("filtered"),
    filters: providerImportedTransactionFiltersSchema.optional()
  })
]);

export const batchImportProviderImportedTransactionsSchema = z.object({
  selection: importedTransactionSelectionSchema,
  categoryId: z.string().min(1).optional()
});

export const batchIgnoreProviderImportedTransactionsSchema = z.object({
  selection: importedTransactionSelectionSchema
});

export const batchUnignoreProviderImportedTransactionsSchema = z.object({
  selection: importedTransactionSelectionSchema
});

export type TransactionInput = z.infer<typeof transactionSchema>;
export type TransactionSharedExpenseInput = z.infer<
  typeof transactionSharedExpenseSchema
>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type TransactionFilters = z.infer<typeof transactionFiltersSchema>;
export type ProviderImportedTransactionFilters = z.infer<
  typeof providerImportedTransactionFiltersSchema
>;
