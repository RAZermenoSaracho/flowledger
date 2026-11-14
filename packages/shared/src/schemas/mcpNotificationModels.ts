import { z } from "zod";
import { optionalDateStringSchema } from "./common.js";
import { createNotificationModelSchema, notificationTestSchema, updateFromSourceSchema, updateNotificationModelSchema, notificationListQuerySchema, validateNotificationCodeSchema } from "./notificationModels.js";
import { notificationRulesSchema } from "./notificationRules.js";

const id = z.string().min(1);
const codeXorRules = {
  check: (v: { code?: unknown; rules?: unknown }) => !(v.code !== undefined && v.rules !== undefined),
  message: { message: "Send either `code` or `rules`, not both", path: ["rules"] }
};

/** Input of the MCP `list_notification_models` tool: the REST list query (optional DSQL JSON `query`). */
export const listNotificationModelsToolSchema = notificationListQuerySchema.strict();

/** Input of the MCP `get_notification_model` and the id-only model tools (delete, publish). */
export const notificationModelIdToolSchema = z.object({ id }).strict();

/** Input of the MCP `list_notification_library` tool: an optional library `modelId` selecting one entry. */
export const listNotificationLibraryToolSchema = z.object({ modelId: id.optional() }).strict();

/** Input of the MCP `install_notification_model` tool. */
export const installNotificationModelToolSchema = z.object({ modelId: id }).strict();

/** Input of the MCP `validate_notification_code` and `parse_notification_rules` tools. */
export const notificationCodeToolSchema = validateNotificationCodeSchema.strict();

/** Input of the MCP `test_notification_model` tool: the model `id` plus the REST test body. */
export const testNotificationModelToolSchema = notificationTestSchema.extend({ id }).strict();

/** Input of the MCP `update_notification_model_from_source` tool: the model `id` plus the REST body. */
export const updateNotificationModelFromSourceToolSchema = updateFromSourceSchema.extend({ id }).strict();

/** Object form of the `create_notification_model` input (used for `.shape`): REST fields plus optional visual `rules`. */
export const createNotificationModelToolObjectSchema = createNotificationModelSchema
  .extend({ code: createNotificationModelSchema.shape.code.optional(), rules: notificationRulesSchema.optional() })
  .strict();

/** Input of the MCP `create_notification_model` tool; `code` and `rules` are mutually exclusive. */
export const createNotificationModelToolSchema = createNotificationModelToolObjectSchema.refine(
  codeXorRules.check,
  codeXorRules.message
);

/** Object form of the `update_notification_model` input (used for `.shape`): `id`, REST partial fields plus optional visual `rules`. */
export const updateNotificationModelToolObjectSchema = updateNotificationModelSchema
  .extend({ id, rules: notificationRulesSchema.optional() })
  .strict();

/** Input of the MCP `update_notification_model` tool; `code` and `rules` are mutually exclusive. */
export const updateNotificationModelToolSchema = updateNotificationModelToolObjectSchema.refine(
  codeXorRules.check,
  codeXorRules.message
);

/** Input of the read-only MCP queue tool; received dates use a half-open UTC range. */
export const notificationQueueToolSchema = z.object({
  id,
  status: z.enum(["queued", "processing"]).optional(),
  receivedFrom: optionalDateStringSchema,
  receivedTo: optionalDateStringSchema,
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50)
}).strict();

/** Input of the read-only MCP logs tool, restricted to terminal run statuses. */
export const notificationLogsToolSchema = notificationQueueToolSchema.extend({
  status: z.enum(["completed", "skipped", "failed"]).optional()
}).strict();
