import {
  exchangeRateToolSchema,
  getReportToolSchema,
  listImportedToolSchema,
  transactionIdToolSchema
} from "@flowledger/shared";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listDebts } from "../../debts/services/read.service.js";
import { capDebtLists } from "../../debts/utils/capDebtLists.js";
import { getExchangeRate, listCurrencies } from "../../currencies/services/read.service.js";
import { countUnreadNotifications, listNotifications } from "../../notifications/services/read.service.js";
import {
  getByCategoryReport,
  getMonthlyCashflowReport,
  getSummaryReport
} from "../../reports/services/read.service.js";
import { getTransactionById, listImportedTransactions } from "../../transactions/services/read.service.js";
import { getCurrentUser } from "../../users/services/read.service.js";
import { publicUser } from "../../../utils/serialize.js";
import { capList } from "../../../utils/listCap.js";
import type { McpAuth } from "../types/mcp.types.js";
import { runRead } from "../utils/runTool.js";

const READ_ONLY = { readOnlyHint: true } as const;
const IMPORTED_LIST_CAP = 100;

/** Registers the personal-finance read tools (debts, reports, exchange rate, notifications, import queue) for the credential's user. */
export function registerPersonalReadTools(server: McpServer, auth: McpAuth) {
  const userId = auth.extra.userId;

  server.registerTool(
    "list_debts",
    {
      description:
        "List the user's debts (owed to the user, owed by the user, settled) and settlement requests. Each list is capped at 100 rows; `totals` gives the full counts.",
      annotations: READ_ONLY
    },
    () => runRead(async () => capDebtLists(await listDebts(userId)))
  );

  server.registerTool(
    "get_report",
    {
      description:
        "Run a report: `summary` (income/expense/balance), `by_category` (per-category breakdown) or `monthly_cashflow`. Optional date range, group/category and currency filters.",
      inputSchema: getReportToolSchema.shape,
      annotations: READ_ONLY
    },
    (args) =>
      runRead(async () => {
        const { type, ...filters } = args;
        if (type === "summary") return { ...(await getSummaryReport(userId, filters)) };
        if (type === "by_category") return { ...(await getByCategoryReport(userId, filters)) };
        return { ...(await getMonthlyCashflowReport(userId, filters)) };
      })
  );

  server.registerTool(
    "get_exchange_rate",
    {
      description: "Get the current exchange rate between two currency codes (for example USD to MXN).",
      inputSchema: exchangeRateToolSchema.shape,
      annotations: READ_ONLY
    },
    ({ from, to }) => runRead(async () => ({ from, to, rate: await getExchangeRate(from, to) }))
  );

  server.registerTool(
    "list_notifications",
    {
      description:
        "List the user's 50 most recent notifications, newest first, plus `unreadCount` (all unread, not only these 50).",
      annotations: READ_ONLY
    },
    () =>
      runRead(async () => {
        const [notifications, unreadCount] = await Promise.all([
          listNotifications(userId),
          countUnreadNotifications(userId)
        ]);
        return { notifications, unreadCount };
      })
  );

  server.registerTool(
    "get_transaction",
    {
      description: "Get one of the user's transactions by id, with its account, category, group, relations and shared expense.",
      inputSchema: transactionIdToolSchema.shape,
      annotations: READ_ONLY
    },
    (args) =>
      runRead(async () => {
        const { id } = transactionIdToolSchema.parse(args);
        return { transaction: await getTransactionById(userId, id) };
      })
  );

  server.registerTool(
    "list_currencies",
    {
      description: "List the supported currency codes (fiat and crypto) usable for accounts, transactions and preferences.",
      annotations: READ_ONLY
    },
    () => runRead(async () => ({ ...(await listCurrencies()) }))
  );

  server.registerTool(
    "get_profile",
    {
      description: "Get the user's own profile: name, email, preferred currency and plan. Never includes credentials.",
      annotations: READ_ONLY
    },
    () => runRead(async () => ({ user: publicUser(await getCurrentUser(userId)) }))
  );

  server.registerTool(
    "list_imported_transactions",
    {
      description:
        "List provider-imported transactions awaiting or past review (read only; importing is done by the user in the app). Capped at 100 rows; `total` is the full match count. Optional `status` filter.",
      inputSchema: listImportedToolSchema.shape,
      annotations: READ_ONLY
    },
    ({ status }) =>
      runRead(async () => {
        const query = status ? JSON.stringify({ where: { field: "status", op: "=", value: status } }) : undefined;
        const result = await listImportedTransactions(userId, query);
        return {
          importedTransactions: capList(result.importedTransactions, IMPORTED_LIST_CAP).data,
          total: result.total,
          pendingCount: result.pendingCount
        };
      })
  );
}
