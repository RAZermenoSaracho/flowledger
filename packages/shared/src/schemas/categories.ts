import { z } from "zod";
import { CATEGORY_TYPES } from "../constants/index.js";

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(CATEGORY_TYPES),
  color: z.string().trim().max(32).optional().nullable()
});

// groupId/scope choose *which* categories are visible at all (an
// authorization boundary — see apps/api's categories read.service.ts);
// `query` is a JSON-encoded DSQL where/sort blob that only ever filters
// within that already-resolved set, same shape and rationale as
// transactions' query param.
export const categoriesQueryParamSchema = z.object({
  groupId: z.string().min(1).optional(),
  scope: z.enum(["all"]).optional(),
  query: z.string().max(4000).optional()
});

export const updateCategorySchema = categorySchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one category field is required"
  );

export type CategoryInput = z.infer<typeof categorySchema>;
export type CategoriesQueryParam = z.infer<typeof categoriesQueryParamSchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
