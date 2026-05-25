import { z } from "zod";
import { CATEGORY_TYPES } from "../constants/index.js";

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(CATEGORY_TYPES),
  color: z.string().trim().max(32).optional().nullable()
});

export const categoryFiltersSchema = z.object({
  groupId: z.string().min(1).optional(),
  includeArchived: z.enum(["true", "false"]).optional()
});

export const updateCategorySchema = categorySchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one category field is required"
  );

export type CategoryInput = z.infer<typeof categorySchema>;
export type CategoryFilters = z.infer<typeof categoryFiltersSchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
