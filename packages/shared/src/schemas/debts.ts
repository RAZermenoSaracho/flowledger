import { z } from "zod";
import { decimalAmountSchema } from "./common.js";

export const settlementRequestSchema = z.object({
  amount: decimalAmountSchema.refine(
    (amount) => Number(amount) > 0,
    "Amount must be greater than 0"
  ),
  accountAmount: decimalAmountSchema.optional(),
  accountId: z.string().min(1, "Account is required"),
  categoryId: z.string().min(1, "Category is required"),
  note: z.string().trim().max(500).optional().nullable(),
  paymentInfo: z.string().trim().max(500).optional().nullable()
});

export const directSettlementSchema = z.object({
  note: z.string().trim().max(500).optional().nullable()
});

export const settlementApprovalSchema = z.object({
  accountAmount: decimalAmountSchema.optional(),
  accountId: z.string().min(1, "Account is required"),
  categoryId: z.string().min(1, "Category is required"),
  expenseOffsetCategoryId: z.string().min(1).optional().nullable()
});

export const batchSettlementApprovalSchema = z.object({
  approvals: z
    .array(
      settlementApprovalSchema.extend({
        settlementRequestId: z.string().min(1)
      })
    )
    .min(1)
});

export const batchSettlementRequestSchema = z.object({
  requests: z
    .array(settlementRequestSchema.extend({ debtId: z.string().min(1) }))
    .min(1)
});

export type SettlementRequestInput = z.infer<typeof settlementRequestSchema>;
export type DirectSettlementInput = z.infer<typeof directSettlementSchema>;
export type SettlementApprovalInput = z.infer<typeof settlementApprovalSchema>;
export type BatchSettlementApprovalInput = z.infer<
  typeof batchSettlementApprovalSchema
>;
export type BatchSettlementRequestInput = z.infer<
  typeof batchSettlementRequestSchema
>;
