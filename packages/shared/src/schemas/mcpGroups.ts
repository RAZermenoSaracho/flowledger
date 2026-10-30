import { z } from "zod";
import { groupCategorySchema, groupMemberSchema } from "./groups.js";

/** Query of `GET /v1/users/search`: a name/email substring of at least 3 characters and at most 10 results. */
export const apiUserSearchQuerySchema = z.object({
  q: z.string().trim().min(3).max(120),
  limit: z.coerce.number().int().positive().max(10).default(10)
});

/** Input of the MCP `search_users` tool: the REST query, strict so unknown keys are rejected. */
export const searchUsersToolSchema = apiUserSearchQuerySchema.strict();

/** Input of the MCP `add_group_member` tool: the group and the user id picked from `search_users`. */
export const addGroupMemberToolSchema = groupMemberSchema.extend({ groupId: z.string().min(1) }).strict();

/** Input of the MCP `create_group_category` tool: the group and the REST category fields. */
export const createGroupCategoryToolSchema = groupCategorySchema.extend({ groupId: z.string().min(1) }).strict();
