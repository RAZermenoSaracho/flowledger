import {
  createNotificationModelSchema,
  createNotificationModelToolObjectSchema,
  createNotificationModelToolSchema,
  generateNotificationCode,
  installNotificationModelToolSchema,
  listNotificationLibraryToolSchema,
  listNotificationModelsToolSchema,
  notificationCodeToolSchema,
  notificationModelIdToolSchema,
  testNotificationModelToolSchema,
  updateFromSourceSchema,
  updateNotificationModelFromSourceToolSchema,
  updateNotificationModelSchema,
  updateNotificationModelToolObjectSchema,
  updateNotificationModelToolSchema
} from "@flowledger/shared";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createModel } from "../../notificationModels/services/create.service.js";
import { deleteModel } from "../../notificationModels/services/delete.service.js";
import { getLibraryModel, installModel, listLibrary, publishModel, updateFromSource } from "../../notificationModels/services/library.service.js";
import { getModelById, listModels } from "../../notificationModels/services/read.service.js";
import { parseCodeToRules, testModel, validateCode } from "../../notificationModels/services/test.service.js";
import { updateModel } from "../../notificationModels/services/update.service.js";
import type { McpAuth } from "../types/mcp.types.js";
import { runRead, runWrite } from "../utils/runTool.js";

const READ_ONLY = { readOnlyHint: true } as const;
const RETRY_NOTE = " Not idempotent: retrying a failed or timed-out call may create a duplicate.";

const WORKFLOW =
  "A notification model turns bank-notification text into a transaction proposal using a small sandboxed Python script `process(text, ctx)`. " +
  "SLOTS declare the records the script refers to ({key, kind: account|category|group, label, required}); BINDINGS map each slot key to the user's OWN record id (from list_accounts / list_categories / list_groups). The script refers to slots by key string only.";

const SCRIPT_API =
  "Script API (returned from process): expense(amount, name, account=None, category=None, group=None, date=None, currency=None, notes=None), income(same args), transfer(amount, name, account, to_account, date=None, currency=None, destination_amount=None, notes=None), skip(reason). " +
  "`amount` is a positive decimal string (helper amount(text) parses \"$1,234.50\"); account/category/group/to_account are slot KEYS; omitted account or currency fall back to the same default rules as transactions; helpers: normalize(text), parse_date(text, format), re. Max 20,000 characters.";

const CODE_OR_RULES =
  "Provide either `code` (the Python script, the saved source of truth) or `rules` (the visual rules model the web Form editor uses; the server generates the canonical script from it), never both.";

/** Registers the notification model read tools: list/get models, the public library, code validation, rule parsing and the dry-run `test_notification_model`. */
export function registerNotificationModelReadTools(server: McpServer, auth: McpAuth) {
  const userId = auth.extra.userId;

  server.registerTool(
    "list_notification_models",
    {
      description: `List the user's notification models (name, active flag, visibility, slots, bindings, endpoint info). Optional \`query\` is a DSQL JSON string for filtering/sorting/paging. ${WORKFLOW}`,
      inputSchema: listNotificationModelsToolSchema.shape,
      annotations: READ_ONLY
    },
    (args) =>
      runRead(async () => {
        const { query } = listNotificationModelsToolSchema.parse(args);
        const { data, meta } = await listModels(userId, query);
        return { data, meta };
      })
  );

  server.registerTool(
    "get_notification_model",
    {
      description:
        "Get one of the user's notification models by id with its code, slots, bindings, settings and ingest endpoint info.",
      inputSchema: notificationModelIdToolSchema.shape,
      annotations: READ_ONLY
    },
    (args) =>
      runRead(async () => {
        const { id } = notificationModelIdToolSchema.parse(args);
        return { model: await getModelById(userId, id) };
      })
  );

  server.registerTool(
    "list_notification_library",
    {
      description:
        "List public notification models other users published, or pass `modelId` for one entry with its latest version's code. Install one with install_notification_model.",
      inputSchema: listNotificationLibraryToolSchema.shape,
      annotations: READ_ONLY
    },
    (args) =>
      runRead(async () => {
        const { modelId } = listNotificationLibraryToolSchema.parse(args);
        return modelId ? { entry: await getLibraryModel(userId, modelId) } : { data: await listLibrary(userId) };
      })
  );

  server.registerTool(
    "validate_notification_code",
    {
      description: `Check a script in the sandbox without saving it. Returns {errors:[{line,col,message}]}; empty means valid. ${SCRIPT_API}`,
      inputSchema: notificationCodeToolSchema.shape,
      annotations: READ_ONLY
    },
    (args) =>
      runRead(async () => {
        const { code } = notificationCodeToolSchema.parse(args);
        return { ...(await validateCode(userId, code)) };
      })
  );

  server.registerTool(
    "parse_notification_rules",
    {
      description:
        "Convert a script into the visual rules model: returns {rules}, or {unsupported} when the script uses constructs the Form editor cannot represent, or {errors}. Pass the result's `rules` back to create/update_notification_model to round-trip.",
      inputSchema: notificationCodeToolSchema.shape,
      annotations: READ_ONLY
    },
    (args) =>
      runRead(async () => {
        const { code } = notificationCodeToolSchema.parse(args);
        return { ...(await parseCodeToRules(userId, code)) };
      })
  );

  server.registerTool(
    "test_notification_model",
    {
      description:
        "Dry-run preview: run sample notification `text` through the model's saved code, or through an unsaved `code`/`settings` override, using its bindings. Returns outcome proposal (with a transactionPreview and any validationErrors), skip or error. Creates NO transactions and NO runs and changes nothing. Real ingestion happens only through the model's ingest endpoint (not an MCP tool).",
      inputSchema: testNotificationModelToolSchema.shape,
      annotations: READ_ONLY
    },
    (args) =>
      runRead(async () => {
        const { id, ...body } = testNotificationModelToolSchema.parse(args);
        return { ...(await testModel(userId, id, body)) };
      })
  );
}

/** Rebuilds the REST body from a tool input: `rules` become the exact script the web Form editor saves, then are dropped. */
function withGeneratedCode<T extends { rules?: Parameters<typeof generateNotificationCode>[0] }>(input: T) {
  const { rules, ...rest } = input;
  return rules ? { ...rest, code: generateNotificationCode(rules) } : rest;
}

/**
 * Registers the notification model write tools. Callers register them only for credentials holding `write`; every
 * handler re-checks via `runWrite`. Ownership, code validation and binding checks are enforced by the services.
 * Ingesting real notifications is deliberately not exposed.
 */
export function registerNotificationModelWriteTools(server: McpServer, auth: McpAuth) {
  const userId = auth.extra.userId;

  server.registerTool(
    "create_notification_model",
    {
      description: `Create a private, inactive notification model. ${WORKFLOW} ${CODE_OR_RULES} ${SCRIPT_API} Slots/bindings may also be set later with update_notification_model; \`isActive: true\` requires code and all required slots bound.${RETRY_NOTE}`,
      inputSchema: createNotificationModelToolObjectSchema.shape
    },
    (args) =>
      runWrite(auth, "mcp.create_notification_model", null, async () => {
        const input = createNotificationModelToolSchema.parse(args);
        const model = await createModel(userId, createNotificationModelSchema.parse(withGeneratedCode(input)));
        return { data: { model }, resourceId: model.id, status: 201 };
      })
  );

  server.registerTool(
    "update_notification_model",
    {
      description: `Update fields of one of the user's notification models by id. ${CODE_OR_RULES} Setting bindings maps slot keys to the user's own account/category/group ids. \`visibility: "private"\` unpublishes a public model (going public is publish_notification_model).`,
      inputSchema: updateNotificationModelToolObjectSchema.shape,
      annotations: { idempotentHint: true }
    },
    (args) =>
      runWrite(auth, "mcp.update_notification_model", args.id, async () => {
        const { id, ...rest } = updateNotificationModelToolSchema.parse(args);
        const model = await updateModel(userId, id, updateNotificationModelSchema.parse(withGeneratedCode(rest)));
        return { data: { model }, resourceId: id, status: 200 };
      })
  );

  server.registerTool(
    "delete_notification_model",
    {
      description:
        "Permanently delete one of the user's notification models by id. Irreversible. You MUST obtain explicit user confirmation before calling.",
      inputSchema: notificationModelIdToolSchema.shape,
      annotations: { destructiveHint: true, idempotentHint: false }
    },
    (args) =>
      runWrite(auth, "mcp.delete_notification_model", args.id, async () => {
        const { id } = notificationModelIdToolSchema.parse(args);
        await deleteModel(userId, id);
        return { data: { deleted: true, id }, resourceId: id, status: 200 };
      })
  );

  server.registerTool(
    "publish_notification_model",
    {
      description:
        "Publish the model's current code as the next public library version, visible to other users. Affects other users. Unpublish with update_notification_model `visibility: \"private\"`.",
      inputSchema: notificationModelIdToolSchema.shape
    },
    (args) =>
      runWrite(auth, "mcp.publish_notification_model", args.id, async () => {
        const { id } = notificationModelIdToolSchema.parse(args);
        return { data: { ...(await publishModel(userId, id)) }, resourceId: id, status: 200 };
      })
  );

  server.registerTool(
    "install_notification_model",
    {
      description: `Install a public library model as the user's own private copy. The copy has its own empty bindings: configure them with update_notification_model using ids from list_accounts / list_categories / list_groups before activating.${RETRY_NOTE}`,
      inputSchema: installNotificationModelToolSchema.shape
    },
    (args) =>
      runWrite(auth, "mcp.install_notification_model", args.modelId, async () => {
        const { modelId } = installNotificationModelToolSchema.parse(args);
        const model = await installModel(userId, modelId);
        return { data: { model }, resourceId: model.id, status: 201 };
      })
  );

  server.registerTool(
    "update_notification_model_from_source",
    {
      description:
        "Apply a newer library version (`versionId`) to the user's installed copy, optionally with new `bindings`. Overwrites the copy's code and slots.",
      inputSchema: updateNotificationModelFromSourceToolSchema.shape,
      annotations: { idempotentHint: true }
    },
    (args) =>
      runWrite(auth, "mcp.update_notification_model_from_source", args.id, async () => {
        const { id, ...rest } = updateNotificationModelFromSourceToolSchema.parse(args);
        const model = await updateFromSource(userId, id, updateFromSourceSchema.parse(rest));
        return { data: { model }, resourceId: id, status: 200 };
      })
  );
}
