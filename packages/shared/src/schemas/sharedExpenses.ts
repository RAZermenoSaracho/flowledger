import { z } from "zod";
import { PARTICIPANT_STATUSES, SHARED_EXPENSE_STATUSES } from "../constants/index.js";
import { moneySchema } from "./common.js";

export const sharedExpenseParticipantSchema = z.object({
  userId: z.string().min(1).optional().nullable(),
  participantName: z.string().trim().min(1).max(120),
  shareAmount: moneySchema,
  paidAmount: moneySchema.default(0),
  status: z.enum(PARTICIPANT_STATUSES).default("pending")
});

export const sharedExpenseSchema = z.object({
  transactionId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  totalAmount: moneySchema,
  status: z.enum(SHARED_EXPENSE_STATUSES).default("open"),
  participants: z.array(sharedExpenseParticipantSchema).min(1).optional()
});

export const updateSharedExpenseSchema = sharedExpenseSchema.partial().extend({
  participants: z.array(sharedExpenseParticipantSchema).optional()
});

export type SharedExpenseInput = z.infer<typeof sharedExpenseSchema>;
export type UpdateSharedExpenseInput = z.infer<typeof updateSharedExpenseSchema>;
