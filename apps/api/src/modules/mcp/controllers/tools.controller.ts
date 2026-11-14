import {
  baseTransactionSchema,
  transactionSchema,
  transactionSearchFilterSchema,
  transactionSummaryFilterSchema,
  updateTransactionSchema,
  updateTransactionToolSchema
} from "@flowledger/shared";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listAccounts } from "../../accounts/services/read.service.js";
import { listCategories } from "../../categories/services/read.service.js";
import { createTransaction } from "../../transactions/services/create.service.js";
import {
  getTransactionsSummary,
  listTransactions
} from "../../transactions/services/read.service.js";
import { updateTransaction } from "../../transactions/services/update.service.js";
import type { McpAuth } from "../types/mcp.types.js";
import { runRead, runWrite } from "../utils/runTool.js";
import { buildTransactionsQuery } from "../utils/transactionsQuery.js";
import { registerGroupReadTools, registerGroupWriteTools } from "./tools.groups.controller.js";
import { registerImportedWriteTools } from "./tools.imports.controller.js";
import { registerNotificationModelReadTools, registerNotificationModelWriteTools } from "./tools.notificationModels.controller.js";
import { registerPersonalReadTools } from "./tools.reads.controller.js";
import { registerUserWriteTools } from "./tools.user.controller.js";
import { registerPersonalWriteTools } from "./tools.writes.controller.js";

const READ_ONLY = { readOnlyHint: true } as const;

/**
 * Registers the FlowLedger tools on `server`: twenty-two read tools always, and the thirty-five write tools only when
 * `auth` holds the `write` scope (each write handler re-checks it). The acting user comes solely from `auth`.
 */
export function registerTools(server: McpServer, auth: McpAuth) {
  const userId = auth.extra.userId;

  server.registerTool(
    "list_accounts",
    { description: "List the user's accounts with balances. `initialBalance` and `currentBalance` are decimal strings.", annotations: READ_ONLY },
    () => runRead(async () => ({ accounts: await listAccounts(userId, undefined) }))
  );

  server.registerTool(
    "list_categories",
    { description: "List the user's transaction categories.", annotations: READ_ONLY },
    () => runRead(async () => ({ categories: await listCategories(userId, {}, undefined) }))
  );

  server.registerTool(
    "search_transactions",
    {
      description:
        "Search the user's transactions, newest first. A YYYY-MM-DD date means that whole UTC day. For a local day, send datetimes: dateFrom is inclusive and a datetime dateTo is exclusive. pageSize max 100.",
      inputSchema: transactionSearchFilterSchema.shape,
      annotations: READ_ONLY
    },
    (args) =>
      runRead(async () => {
        const { data, meta } = await listTransactions(userId, buildTransactionsQuery(args));
        return { data, meta };
      })
  );

  server.registerTool(
    "get_transaction_summary",
    {
      description: "Total income, expenses and balance of the user's transactions matching the filter. A YYYY-MM-DD date means that whole UTC day; dateFrom is inclusive and a datetime dateTo is exclusive.",
      inputSchema: transactionSummaryFilterSchema.shape,
      annotations: READ_ONLY
    },
    (args) => runRead(() => getTransactionsSummary(userId, buildTransactionsQuery(args)))
  );

  registerPersonalReadTools(server, auth);
  registerGroupReadTools(server, auth);
  registerNotificationModelReadTools(server, auth);

  if (!auth.scopes.includes("write")) return;

  server.registerTool(
    "create_transaction",
    {
      description: "Create a transaction for the user. Same rules as the FlowLedger web app. `date` is the execution time: a datetime with Z or an offset, or YYYY-MM-DD for 00:00 UTC on that date. Native amounts (`amount`, `accountAmount`, `destinationAmount`, `feeAmount`) are decimal strings such as \"1.234567890123456789\", never numbers, within the currency's minor units (18 decimals for non-ISO currencies). When the amount's currency differs from the account's, `accountAmount` is required; for a transfer to an account in another currency, `destinationAmount` is required. The server never derives them from a rate: use get_exchange_rate for a suggestion. An optional fee needs both `feeAmount` and `feeCurrency` (the amount's or the destination account's currency).",
      inputSchema: baseTransactionSchema.shape
    },
    async (args) =>
      runWrite(auth, "mcp.create_transaction", null, async () => {
        const body = transactionSchema.parse(args);
        const transaction = await createTransaction(userId, body);
        return { data: { transaction }, resourceId: transaction.id, status: 201 };
      })
  );

  server.registerTool(
    "update_transaction",
    {
      description: "Update fields of one of the user's transactions by id. `date` is a datetime with Z or an offset, or YYYY-MM-DD for 00:00 UTC; omit it to keep the stored time. Amounts are decimal strings; changing the amount, currency, type or an account of a cross-currency transaction requires restating `accountAmount`/`destinationAmount`. Financial edits are recorded in the correction history.",
      inputSchema: updateTransactionToolSchema.shape,
      annotations: { idempotentHint: true }
    },
    async (args) =>
      runWrite(auth, "mcp.update_transaction", args.id, async () => {
        const { id, ...rest } = args;
        const transaction = await updateTransaction(userId, id, updateTransactionSchema.parse(rest));
        return { data: { transaction }, resourceId: id, status: 200 };
      })
  );

  registerPersonalWriteTools(server, auth);
  registerImportedWriteTools(server, auth);
  registerUserWriteTools(server, auth);
  registerGroupWriteTools(server, auth);
  registerNotificationModelWriteTools(server, auth);
}
