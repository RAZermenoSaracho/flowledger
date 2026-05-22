import { z } from "zod";
import { categorySchema } from "./categories.js";

export const groupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable()
});

export const updateGroupSchema = groupSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one group field is required"
);

export const groupFiltersSchema = z.object({
  includeArchived: z.enum(["true", "false"]).optional()
});

export const groupMemberSchema = z.object({
  userId: z.string().min(1)
});

export const groupCategorySchema = categorySchema;

export type GroupInput = z.infer<typeof groupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type GroupFilters = z.infer<typeof groupFiltersSchema>;
export type GroupMemberInput = z.infer<typeof groupMemberSchema>;
export type GroupCategoryInput = z.infer<typeof groupCategorySchema>;
