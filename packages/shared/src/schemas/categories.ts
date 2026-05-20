import { z } from "zod";
import { CATEGORY_TYPES } from "../constants/index.js";

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(CATEGORY_TYPES),
  color: z.string().trim().max(32).optional().nullable()
});

export const updateCategorySchema = categorySchema.partial();

export type CategoryInput = z.infer<typeof categorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
