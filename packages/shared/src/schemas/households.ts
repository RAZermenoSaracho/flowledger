import { z } from "zod";
import { categorySchema } from "./categories.js";

export const householdSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable()
});

export const householdMemberSchema = z.object({
  userId: z.string().min(1)
});

export const householdCategorySchema = categorySchema;

export type HouseholdInput = z.infer<typeof householdSchema>;
export type HouseholdMemberInput = z.infer<typeof householdMemberSchema>;
export type HouseholdCategoryInput = z.infer<typeof householdCategorySchema>;
