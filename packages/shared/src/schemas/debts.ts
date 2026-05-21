import { z } from "zod";
import { moneySchema } from "./common.js";

export const settlementRequestSchema = z.object({
  amount: moneySchema.refine((amount) => amount > 0, "Amount must be greater than 0"),
  note: z.string().trim().max(500).optional().nullable()
});

export const directSettlementSchema = z.object({
  note: z.string().trim().max(500).optional().nullable()
});

export type SettlementRequestInput = z.infer<typeof settlementRequestSchema>;
export type DirectSettlementInput = z.infer<typeof directSettlementSchema>;
