import { z } from "zod";
import {
  TRANSACTION_FILTER_TYPES,
  TRANSACTION_TYPES
} from "../constants/index.js";
import { currencyCodeSchema, moneySchema } from "./common.js";
import { sharedExpenseParticipantSchema } from "./sharedExpenses.js";

export const transactionSharedExpenseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  participants: z.array(sharedExpenseParticipantSchema).min(1)
});

const baseTransactionSchema = z.object({
  name: z.string().trim().min(1).max(160),
  amount: moneySchema,
  executionCurrency: currencyCodeSchema.optional(),
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

// The /transactions and /transactions/summary endpoints accept a single
// JSON-encoded query-string parameter (a DataSieveQuery<TransactionRecord>
// -shaped `where`/`search`/`sort`/`pagination`) rather than flat filter
// params — see apps/api's transactions read.service.ts for why (DSQL's
// and/or/not trees + typed values don't round-trip reliably through
// bracket-notation query strings). This schema only validates that the
// param is present/shaped as a string; the decoded JSON is validated by
// datasieve's own parse/validate pipeline, except for two virtual leaf
// fields ("classification", "transactionFilterType") the frontend's
// domain builder can place anywhere in the `where` tree — read.service.ts
// walks the tree and validates each such leaf's value against
// `classificationSchema`/`transactionFilterTypeSchema` below as it
// rewrites it into a real condition.
export const transactionsQueryParamSchema = z.object({
  query: z.string().max(4000).optional()
});

export const transactionFilterTypeSchema = z.enum(TRANSACTION_FILTER_TYPES);
export const classificationSchema = z.enum(["complete", "needsClassification"]);

// Same "query" param shape as transactionsQueryParamSchema: the deep
// where/sort tree is JSON-encoded, decoded and validated by datasieve's own
// parse/validate pipeline in read.service.ts, not by Zod here (matches
// TransactionsQueryInput's convention — see that type's doc comment). One
// difference from the main transactions list: the imported-transactions
// `where` tree may contain a leaf condition on the virtual field "search"
// (free text — spans description/provider/category name/linked-account
// name/institution name/raw metadata, none of which are a single real
// column DSQL could target at once), which read.service.ts's
// `resolveImportedTransactionIds` rewrites into a real `id in [...]`
// condition before the rest reaches datasieve.
export const importedTransactionsQueryParamSchema = z.object({
  query: z.string().max(4000).optional()
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
    // Untyped/unvalidated here on purpose — same DSQL `where` tree shape
    // (and same validation-deferred-to-datasieve rationale) as
    // `importedTransactionsQueryParamSchema.query`'s decoded contents.
    where: z.unknown().optional()
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
export type TransactionsQueryParam = z.infer<typeof transactionsQueryParamSchema>;
export type ImportedTransactionsQueryParam = z.infer<
  typeof importedTransactionsQueryParamSchema
>;
export type TransactionFilterType = z.infer<typeof transactionFilterTypeSchema>;
export type Classification = z.infer<typeof classificationSchema>;
