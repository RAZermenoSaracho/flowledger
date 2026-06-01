import { z } from "zod";
import { ACCOUNT_TYPES } from "../constants/index.js";

export const accountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(ACCOUNT_TYPES),
  identifier: z.string().trim().max(120).optional().nullable(),
  initialBalance: z.coerce.number().finite().default(0)
});

export const updateAccountSchema = accountSchema.partial();

export const accountFiltersSchema = z.object({
  includeArchived: z
    .enum(["true", "false"])
    .optional()
});

export type AccountInput = z.infer<typeof accountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type AccountFilters = z.infer<typeof accountFiltersSchema>;
