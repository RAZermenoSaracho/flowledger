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

// GET /groups accepts a single JSON-encoded `query` param (DSQL where/sort),
// same shape and rationale as transactions'/accounts' query param — see
// apps/api's groups read.service.ts.
export const groupsQueryParamSchema = z.object({
  query: z.string().max(4000).optional()
});

export const groupMemberSchema = z.object({
  userId: z.string().min(1)
});

export const groupCategorySchema = categorySchema;

export type GroupInput = z.infer<typeof groupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type GroupsQueryParam = z.infer<typeof groupsQueryParamSchema>;
export type GroupMemberInput = z.infer<typeof groupMemberSchema>;
export type GroupCategoryInput = z.infer<typeof groupCategorySchema>;
