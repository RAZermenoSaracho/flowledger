import { z } from "zod";
import { CATEGORY_TYPES } from "../constants/index.js";

export const householdSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable()
});

export const householdMemberSchema = z.object({
  userId: z.string().min(1)
});

export const householdCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(CATEGORY_TYPES).default("expense"),
  color: z.string().trim().max(32).optional().nullable()
});

export type HouseholdInput = z.infer<typeof householdSchema>;
export type HouseholdMemberInput = z.infer<typeof householdMemberSchema>;
export type HouseholdCategoryInput = z.infer<typeof householdCategorySchema>;
