import { z } from "zod";
import { PROVIDER_IMPORTED_TRANSACTION_STATUSES, TRANSACTION_TYPES } from "../constants/index.js";
import { updateAccountSchema } from "./accounts.js";
import { categorySchema } from "./categories.js";
import { currencyRateQuerySchema } from "./currencies.js";
import { settlementRequestSchema } from "./debts.js";
import { groupSchema } from "./groups.js";
import { reportFiltersSchema } from "./reports.js";
import { updateProviderImportedTransactionSchema, updateTransactionSchema } from "./transactions.js";

const isoDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Structured filter accepted by the MCP `search_transactions` tool; strict so unknown keys are rejected instead of silently ignored. */
export const transactionSearchFilterSchema = z
  .object({
    dateFrom: isoDaySchema.optional(),
    dateTo: isoDaySchema.optional(),
    accountId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    text: z.string().trim().min(1).max(100).optional(),
    type: z.enum(TRANSACTION_TYPES).optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(50)
  })
  .strict();

/** Filter for the MCP `get_transaction_summary` tool: the search filter without paging. */
export const transactionSummaryFilterSchema = transactionSearchFilterSchema.omit({
  page: true,
  pageSize: true
});

/** Input of the MCP `update_transaction` tool: the web update fields plus the target transaction `id`. */
export const updateTransactionToolSchema = updateTransactionSchema.extend({
  id: z.string().min(1)
});

/** Input of the MCP `update_account` tool: the web update fields plus the target account `id`. */
export const updateAccountToolSchema = updateAccountSchema.extend({ id: z.string().min(1) });

/** Input of the MCP `update_category` tool: the optional category fields plus the target `id` (the at-least-one-field rule is enforced by `updateCategorySchema` on the remainder). */
export const updateCategoryToolSchema = categorySchema.partial().extend({ id: z.string().min(1) });

/** Input of the MCP `get_report` tool: which report to run plus the shared report filters. */
export const getReportToolSchema = reportFiltersSchema.extend({
  type: z.enum(["summary", "by_category", "monthly_cashflow"])
});

/** Input of the MCP `get_exchange_rate` tool: the REST rate query, strict so unknown keys are rejected. */
export const exchangeRateToolSchema = currencyRateQuerySchema.strict();

/** Input of the MCP `list_imported_transactions` tool: optional review-status filter. */
export const listImportedToolSchema = z
  .object({ status: z.enum(PROVIDER_IMPORTED_TRANSACTION_STATUSES).optional() })
  .strict();

/** Input of the MCP `set_account_archived` and `set_category_archived` tools: target `id` and desired state. */
export const setArchivedToolSchema = z.object({ id: z.string().min(1), archived: z.boolean() }).strict();

/** Input of the MCP `delete_transaction` tool: the target transaction `id` only. */
export const transactionIdToolSchema = z.object({ id: z.string().min(1) }).strict();

/** Input of the MCP `update_group` tool: the optional group fields plus the target `id` (the at-least-one-field rule is enforced by `updateGroupSchema` on the remainder). */
export const updateGroupToolSchema = groupSchema.partial().extend({ id: z.string().min(1) });

/** Input of the MCP `remove_group_member` tool: the group and the member to remove; omitting `userId` means the caller leaves. */
export const removeGroupMemberToolSchema = z
  .object({ groupId: z.string().min(1), userId: z.string().min(1).optional() })
  .strict();

/** Input of the MCP `request_settlement` tool: the debt id plus the REST settlement request fields. */
export const requestSettlementToolSchema = settlementRequestSchema.extend({ debtId: z.string().min(1) });

/** Input of the MCP `list_groups` and `list_shared_expenses` tools: an optional `id` selecting one record instead of the list. */
export const optionalIdToolSchema = z.object({ id: z.string().min(1).optional() }).strict();

export type TransactionSearchFilter = z.infer<typeof transactionSearchFilterSchema>;
export type TransactionSummaryFilter = z.infer<typeof transactionSummaryFilterSchema>;

/** Maximum imported transactions one external batch call may act on. */
export const IMPORTED_BATCH_MAX = 50;

const importedIdsSchema = z.array(z.string().min(1)).min(1).max(IMPORTED_BATCH_MAX);
const importedIdsSelectionSchema = z.object({ mode: z.literal("ids"), ids: importedIdsSchema });

/** Body of `POST /v1/imported-transactions/batch-ignore` and `/batch-unignore`: the web shape restricted to `ids` mode (the filtered/all mode is rejected) and capped at 50 ids. */
export const publicBatchImportedSchema = z.object({ selection: importedIdsSelectionSchema });

/** Body of `POST /v1/imported-transactions/batch-import`: `publicBatchImportedSchema` plus the optional category applied to every row. */
export const publicBatchImportImportedSchema = publicBatchImportedSchema.extend({
  categoryId: z.string().min(1).optional()
});

/** Input of the MCP `ignore_imported_transactions` and `unignore_imported_transactions` tools. */
export const importedIdsToolSchema = z.object({ ids: importedIdsSchema }).strict();

/** Input of the MCP `import_imported_transactions` tool: the ids plus an optional category applied to every row. */
export const importImportedToolSchema = importedIdsToolSchema.extend({ categoryId: z.string().min(1).optional() });

/** Input of the MCP `update_imported_transaction` tool: the imported row `id` plus the web `categoryId` (null clears it). */
export const updateImportedToolSchema = updateProviderImportedTransactionSchema.extend({ id: z.string().min(1) }).strict();

/** Input object of the MCP `mark_notifications_read` tool (the exactly-one rule lives in `markNotificationsReadInputSchema`). */
export const markNotificationsReadToolSchema = z
  .object({ id: z.string().min(1).optional(), all: z.literal(true).optional() })
  .strict();

/** Validator for `mark_notifications_read`: exactly one of `id` (one notification) or `all: true`. */
export const markNotificationsReadInputSchema = markNotificationsReadToolSchema.refine(
  (input) => (input.id !== undefined) !== (input.all !== undefined),
  { message: "Provide exactly one of id or all: true" }
);
