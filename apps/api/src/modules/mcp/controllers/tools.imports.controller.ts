import {
  importedIdsToolSchema,
  importImportedToolSchema,
  updateImportedToolSchema
} from "@flowledger/shared";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { batchImportProviderImportedTransactions } from "../../transactions/services/create.service.js";
import {
  batchIgnoreImportedTransactions,
  batchUnignoreImportedTransactions,
  updateImportedTransactionCategory
} from "../../transactions/services/update.service.js";
import type { McpAuth } from "../types/mcp.types.js";
import { runWrite } from "../utils/runTool.js";

const BATCH_NOTE =
  " Takes 1 to 50 imported-transaction ids. Validation is all-or-nothing: if any row is not in the required status the call fails with per-row errors and changes nothing. Ids that are not the user's are silently skipped.";

/**
 * Registers the imported-transaction review write tools (set category, ignore, unignore, import). Callers register
 * them only for credentials holding `write`; every handler re-checks via `runWrite`. Only explicit id lists are
 * accepted, never the web app's "all/filtered" selection.
 */
export function registerImportedWriteTools(server: McpServer, auth: McpAuth) {
  const userId = auth.extra.userId;
  const selection = (ids: string[]) => ({ mode: "ids" as const, ids });

  server.registerTool(
    "update_imported_transaction",
    {
      description:
        "Set (or clear with null) the category of one pending imported transaction. The category type must match the row's income/expense direction.",
      inputSchema: updateImportedToolSchema.shape,
      annotations: { idempotentHint: true }
    },
    async (args) =>
      runWrite(auth, "mcp.update_imported_transaction", args.id, async () => {
        const { id, categoryId } = updateImportedToolSchema.parse(args);
        const importedTransaction = await updateImportedTransactionCategory(userId, id, { categoryId });
        return { data: { importedTransaction }, resourceId: id, status: 200 };
      })
  );

  server.registerTool(
    "ignore_imported_transactions",
    {
      description: `Mark pending imported transactions as ignored (reversible with unignore_imported_transactions).${BATCH_NOTE}`,
      inputSchema: importedIdsToolSchema.shape,
      annotations: { idempotentHint: false }
    },
    async (args) =>
      runWrite(auth, "mcp.ignore_imported_transactions", null, async () => {
        const { ids } = importedIdsToolSchema.parse(args);
        const ignoredCount = await batchIgnoreImportedTransactions(userId, selection(ids));
        return { data: { ignoredCount, errors: [] }, resourceId: `batch:${ids.length}`, status: 200 };
      })
  );

  server.registerTool(
    "unignore_imported_transactions",
    {
      description: `Return ignored imported transactions to pending review.${BATCH_NOTE}`,
      inputSchema: importedIdsToolSchema.shape,
      annotations: { idempotentHint: false }
    },
    async (args) =>
      runWrite(auth, "mcp.unignore_imported_transactions", null, async () => {
        const { ids } = importedIdsToolSchema.parse(args);
        const unignoredCount = await batchUnignoreImportedTransactions(userId, selection(ids));
        return { data: { unignoredCount, errors: [] }, resourceId: `batch:${ids.length}`, status: 200 };
      })
  );

  server.registerTool(
    "import_imported_transactions",
    {
      description: `Create real transactions from pending bank imports (the same as the web app's Import). Each row needs a category (set earlier or passed as categoryId, applied to every row) of the matching type. The imports cannot be undone except by deleting the created transactions. You MUST obtain explicit user confirmation before calling.${BATCH_NOTE} Rows are validated up front; the creation loop itself is sequential and not wrapped in one database transaction.`,
      inputSchema: importImportedToolSchema.shape,
      annotations: { destructiveHint: false, idempotentHint: false }
    },
    async (args) =>
      runWrite(auth, "mcp.import_imported_transactions", null, async () => {
        const { ids, categoryId } = importImportedToolSchema.parse(args);
        const result = await batchImportProviderImportedTransactions(userId, {
          selection: selection(ids),
          categoryId
        });
        return { data: { ...result }, resourceId: `batch:${ids.length}`, status: 201 };
      })
  );
}
