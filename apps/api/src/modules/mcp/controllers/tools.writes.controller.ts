import {
  accountSchema,
  categorySchema,
  setArchivedToolSchema,
  transactionIdToolSchema,
  updateAccountSchema,
  updateAccountToolSchema,
  updateCategorySchema,
  updateCategoryToolSchema
} from "@flowledger/shared";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createAccount } from "../../accounts/services/create.service.js";
import { deleteAccount } from "../../accounts/services/delete.service.js";
import {
  archiveAccount,
  restoreAccount,
  updateAccount
} from "../../accounts/services/update.service.js";
import { createCategory } from "../../categories/services/create.service.js";
import { deleteCategory } from "../../categories/services/delete.service.js";
import {
  archiveCategory,
  restoreCategory,
  updateCategory
} from "../../categories/services/update.service.js";
import { deleteTransaction } from "../../transactions/services/delete.service.js";
import type { McpAuth } from "../types/mcp.types.js";
import { runWrite } from "../utils/runTool.js";

const RETRY_NOTE = " Not idempotent: retrying a failed or timed-out call may create a duplicate.";

/**
 * Registers the personal-finance write tools (account/category create, update, archive toggle and
 * account/category/transaction delete). Callers register them only for credentials holding `write`; every handler
 * re-checks via `runWrite`. Args are re-parsed with the shared REST schemas so unknown keys never reach a service.
 */
export function registerPersonalWriteTools(server: McpServer, auth: McpAuth) {
  const userId = auth.extra.userId;

  server.registerTool(
    "create_account",
    {
      description: `Create an account for the user.${RETRY_NOTE}`,
      inputSchema: accountSchema.shape
    },
    async (args) =>
      runWrite(auth, "mcp.create_account", null, async () => {
        const account = await createAccount(userId, accountSchema.parse(args));
        return { data: { account }, resourceId: account.id, status: 201 };
      })
  );

  server.registerTool(
    "update_account",
    {
      description: "Update fields of one of the user's accounts by id.",
      inputSchema: updateAccountToolSchema.shape,
      annotations: { idempotentHint: true }
    },
    async (args) =>
      runWrite(auth, "mcp.update_account", args.id, async () => {
        const { id, ...rest } = args;
        const account = await updateAccount(userId, id, updateAccountSchema.parse(rest));
        return { data: { account }, resourceId: id, status: 200 };
      })
  );

  server.registerTool(
    "set_account_archived",
    {
      description:
        "Archive (`archived: true`) or restore (`archived: false`) one of the user's accounts. Transactions are untouched.",
      inputSchema: setArchivedToolSchema.shape,
      annotations: { idempotentHint: true }
    },
    async (args) =>
      runWrite(auth, "mcp.set_account_archived", args.id, async () => {
        const { id, archived } = setArchivedToolSchema.parse(args);
        const account = await (archived ? archiveAccount : restoreAccount)(userId, id);
        return { data: { account }, resourceId: id, status: 200 };
      })
  );

  server.registerTool(
    "create_category",
    {
      description: `Create a personal category for the user.${RETRY_NOTE}`,
      inputSchema: categorySchema.shape
    },
    async (args) =>
      runWrite(auth, "mcp.create_category", null, async () => {
        const category = await createCategory(userId, categorySchema.parse(args));
        return { data: { category }, resourceId: category.id, status: 201 };
      })
  );

  server.registerTool(
    "update_category",
    {
      description: "Update the name, type or color of one of the user's categories by id.",
      inputSchema: updateCategoryToolSchema.shape,
      annotations: { idempotentHint: true }
    },
    async (args) =>
      runWrite(auth, "mcp.update_category", args.id, async () => {
        const { id, ...rest } = args;
        const category = await updateCategory(userId, id, updateCategorySchema.parse(rest));
        return { data: { category }, resourceId: id, status: 200 };
      })
  );

  server.registerTool(
    "set_category_archived",
    {
      description:
        "Archive (`archived: true`) or restore (`archived: false`) one of the user's categories.",
      inputSchema: setArchivedToolSchema.shape,
      annotations: { idempotentHint: true }
    },
    async (args) =>
      runWrite(auth, "mcp.set_category_archived", args.id, async () => {
        const { id, archived } = setArchivedToolSchema.parse(args);
        const category = await (archived ? archiveCategory : restoreCategory)(userId, id);
        return { data: { category }, resourceId: id, status: 200 };
      })
  );

  server.registerTool(
    "delete_account",
    {
      description:
        "Permanently delete one of the user's accounts by id (the same operation as the web app; prefer set_account_archived to hide it). Irreversible: its transactions are kept but lose their account link, and a transfer to or from it loses that leg's account. Imported-transaction and provider-account links are cleared. You MUST obtain explicit user confirmation before calling.",
      inputSchema: transactionIdToolSchema.shape,
      annotations: { destructiveHint: true, idempotentHint: false }
    },
    async (args) =>
      runWrite(auth, "mcp.delete_account", args.id, async () => {
        const { id } = transactionIdToolSchema.parse(args);
        await deleteAccount(userId, id);
        return { data: { deleted: true, id }, resourceId: id, status: 200 };
      })
  );

  server.registerTool(
    "delete_category",
    {
      description:
        "Permanently delete one of the user's categories by id (the same operation as the web app; prefer set_category_archived to hide it). Irreversible: its transactions are kept but become uncategorized. Group categories require group admin. You MUST obtain explicit user confirmation before calling.",
      inputSchema: transactionIdToolSchema.shape,
      annotations: { destructiveHint: true, idempotentHint: false }
    },
    async (args) =>
      runWrite(auth, "mcp.delete_category", args.id, async () => {
        const { id } = transactionIdToolSchema.parse(args);
        await deleteCategory(userId, id);
        return { data: { deleted: true, id }, resourceId: id, status: 200 };
      })
  );

  server.registerTool(
    "delete_transaction",
    {
      description:
        "Permanently delete one of the user's transactions by id. Irreversible: also deletes its related notifications and its linked shared expense, participants and settlement requests. Confirm with the user before calling.",
      inputSchema: transactionIdToolSchema.shape,
      annotations: { destructiveHint: true, idempotentHint: false }
    },
    async (args) =>
      runWrite(auth, "mcp.delete_transaction", args.id, async () => {
        const { id } = transactionIdToolSchema.parse(args);
        await deleteTransaction(userId, id);
        return { data: { deleted: true, id }, resourceId: id, status: 200 };
      })
  );
}
