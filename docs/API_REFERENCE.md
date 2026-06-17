# API Reference

Base URL: `http://localhost:4000` (dev). All authenticated routes require `Authorization: Bearer <JWT>`.

Routes are mounted in `apps/api/src/server.ts`.

---

## Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Returns `{ status: "ok" }` |

---

## Currencies — `/currencies`

Module: `apps/api/src/modules/currencies/currencies.routes.ts`

No authentication required.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/currencies` | No | Returns the combined list of fiat and crypto currencies. |

**Response:** `{ currencies: Array<{ code: string, name: string, type: "fiat" \| "crypto" }> }` — sorted alphabetically by code. Fiat data sourced from Frankfurter (24 h cache), crypto base assets from Binance (1 h cache). Degrades gracefully if either upstream is unavailable.

---

## Auth — `/auth`

Module: `apps/api/src/modules/auth/auth.routes.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | No | Create account. Body: `{ name, email, password }`. Returns `{ token, user }`. |
| POST | `/auth/login` | No | Login. Body: `{ email, password }`. Returns `{ token, user }`. |
| GET | `/auth/me` | Yes | Returns current user. |
| GET | `/auth/google` | No | Initiates Google OAuth. Query: `{ redirect }`. Redirects to Google. |
| GET | `/auth/google/callback` | No | Google OAuth callback. Sets cookie, redirects to frontend with token in URL hash. |

**Validation schemas:** `registerSchema`, `loginSchema`, `googleOAuthStartQuerySchema`, `googleOAuthCallbackQuerySchema` from `@flowledger/shared`.

---

## Users — `/users`

Module: `apps/api/src/modules/users/users.routes.ts`

All routes require auth.

| Method | Path | Description |
|---|---|---|
| PATCH | `/users/me` | Update profile (name, email, optional preferredCurrency). |
| POST | `/users/me/avatar` | Upload avatar image (multipart). |
| DELETE | `/users/me/avatar` | Remove avatar. |

**Validation schemas:** `updateUserProfileSchema` (`name`, `email`, `preferredCurrency?` — any 1–10 char string or null; valid codes served by `GET /currencies`), `updateUserPasswordSchema`, `updateUserPlanSchema`.

---

## Accounts — `/accounts`

Module: `apps/api/src/modules/accounts/accounts.routes.ts`

All routes require auth.

| Method | Path | Description |
|---|---|---|
| GET | `/accounts` | List user accounts with computed balances and provider sync summary. Query: `{ includeArchived }`. |
| POST | `/accounts` | Create account. Body: `{ name, type, identifier?, initialBalance?, groupId? }`. |
| GET | `/accounts/:id` | Get single account with balance and sync state. |
| PUT | `/accounts/:id` | Update account. |
| DELETE | `/accounts/:id` | Delete account (and unlink from provider accounts). |
| PATCH | `/accounts/:id/archive` | Archive account. |
| PATCH | `/accounts/:id/unarchive` | Unarchive account. |

Account balance is computed from transactions: `initialBalance + income - expenses + transfer_in - transfer_out`.

Provider sync summary includes `source: "manual" | "provider"` and an array of sync entries from linked `ProviderAccount` records.

---

## Categories — `/categories`

Module: `apps/api/src/modules/categories/categories.routes.ts`

All routes require auth.

| Method | Path | Description |
|---|---|---|
| GET | `/categories` | List accessible categories (personal + group member). |
| POST | `/categories` | Create category. Body: `{ name, type, color?, groupId? }`. |
| GET | `/categories/:id` | Get single category. |
| PUT | `/categories/:id` | Update category. |
| DELETE | `/categories/:id` | Delete category. |
| PATCH | `/categories/:id/archive` | Archive category. |
| PATCH | `/categories/:id/unarchive` | Unarchive category. |

Personal categories: `groupId = null`, accessible to the owning user only. Group categories: owned by a group, accessible to group members.

---

## Groups — `/groups`

Module: `apps/api/src/modules/groups/groups.routes.ts`

All routes require auth.

| Method | Path | Description |
|---|---|---|
| GET | `/groups` | List groups the user is a member of or owns. |
| POST | `/groups` | Create group. Body: `{ name, description? }`. |
| GET | `/groups/:id` | Get group with members and categories. |
| PUT | `/groups/:id` | Update group (admin only). |
| DELETE | `/groups/:id` | Delete group (owner only). |
| PATCH | `/groups/:id/archive` | Archive group. |
| POST | `/groups/:id/members` | Add member by email. Sends notification. |
| DELETE | `/groups/:id/members/:userId` | Remove member. |

---

## Transactions — `/transactions`

Module: `apps/api/src/modules/transactions/transactions.routes.ts`

All routes require auth.

### Regular transactions

| Method | Path | Description |
|---|---|---|
| GET | `/transactions` | List transactions. Query filters: `dateFrom`, `dateTo`, `amountFrom`, `amountTo`, `categoryId`, `groupId`, `accountId`, `type`, `transactionFilterType`, `classification`, `search`. |
| POST | `/transactions` | Create transaction. Body: `transactionSchema`. Can include `sharedExpense` to create a shared expense in the same request. |
| GET | `/transactions/:id` | Get transaction with related entities. |
| PUT | `/transactions/:id` | Update transaction. Body: partial transaction fields. |
| DELETE | `/transactions/:id` | Delete transaction (cascades shared expense and notifications). |

Transaction filter types (`transactionFilterType`): `normal`, `settlement`, `expenseOffset`. Classification filter: `complete`, `needsClassification`.

### Imported transactions (provider review workflow)

| Method | Path | Description |
|---|---|---|
| GET | `/transactions/imported` | List imported transactions. Supports rich filters (status, search, provider, accountId, dateFrom/To, amountFrom/To, sortBy, sortDirection). |
| GET | `/transactions/imported/pending-count` | Quick count of pending imported transactions. |
| PATCH | `/transactions/imported/:id` | Update imported transaction (assign/change category). |
| POST | `/transactions/imported/:id/import` | Import a pending transaction → creates a Transaction. |
| POST | `/transactions/imported/:id/ignore` | Ignore a pending transaction. |
| POST | `/transactions/imported/:id/unignore` | Move an ignored transaction back to pending. |
| POST | `/transactions/imported/batch-import` | Bulk import by ID list or filter selection. |
| POST | `/transactions/imported/batch-ignore` | Bulk ignore by ID list or filter selection. |
| POST | `/transactions/imported/batch-unignore` | Bulk unignore by ID list or filter selection. |

**Validation schemas:** `transactionSchema`, `updateTransactionSchema`, `transactionFiltersSchema`, `providerImportedTransactionFiltersSchema`, `importProviderImportedTransactionSchema`, `updateProviderImportedTransactionSchema`, `batchImportProviderImportedTransactionsSchema`, `batchIgnoreProviderImportedTransactionsSchema`, `batchUnignoreProviderImportedTransactionsSchema`.

---

## Shared Expenses — `/shared-expenses`

Module: `apps/api/src/modules/shared-expenses/sharedExpenses.routes.ts`

All routes require auth.

| Method | Path | Description |
|---|---|---|
| GET | `/shared-expenses` | List shared expenses the user owns or participates in. |
| POST | `/shared-expenses` | Create shared expense for an existing transaction. Body: `sharedExpenseSchema`. |
| GET | `/shared-expenses/:id` | Get shared expense with participants. |
| PUT | `/shared-expenses/:id` | Update shared expense (owner only). Can update participants (replaces all). |
| DELETE | `/shared-expenses/:id` | Delete shared expense (owner only). |

---

## Debts — `/debts` and Settlements — `/settlements`

Module: `apps/api/src/modules/debts/debts.routes.ts`

All routes require auth.

| Method | Path | Description |
|---|---|---|
| GET | `/debts` | Returns `{ iOwe, owedToMe, pendingSettlementRequests, approvedSettlementRequests, settledDebts }`. |
| POST | `/debts/:id/settlement-request` | Debtor creates a settlement request. Body: `{ amount, accountId, categoryId, note?, paymentInfo? }`. |
| POST | `/debts/:id/settle` | Creditor directly marks a debt as settled (no pending request required). Body: direct settlement schema. |
| POST | `/settlements/:id/approve` | Creditor approves a settlement request. Creates debtor + creditor transactions and links them. Body: `{ accountId, categoryId, expenseOffsetCategoryId? }`. |
| POST | `/settlements/:id/reject` | Creditor rejects a settlement request. Notifies debtor. |

---

## Reports — `/reports`

Module: `apps/api/src/modules/reports/reports.routes.ts`

All routes require auth. Common query filters: `dateFrom`, `dateTo`, `groupId`, `groupIds[]`, `categoryId`, `categoryIds[]`.

| Method | Path | Description |
|---|---|---|
| GET | `/reports/summary` | Returns `{ totalIncome, totalNetIncome, totalGrossIncome, totalExpenses, totalNetExpenses, totalGrossExpenses, totalExpenseReimbursements, currentBalance }`. |
| GET | `/reports/by-category` | Aggregated income/expense totals per category with reimbursement breakdown. |
| GET | `/reports/monthly-cashflow` | Monthly cashflow rows `{ month, income, expenses, grossExpenses, expenseReimbursements, netExpenses, grossIncome, incomeOffsets, netIncome, balance }`. |

**Validation schema:** `reportFiltersSchema` from `@flowledger/shared`.

---

## Notifications — `/notifications`

Module: `apps/api/src/modules/notifications/notifications.routes.ts`

All routes require auth.

| Method | Path | Description |
|---|---|---|
| GET | `/notifications` | List all notifications for the user (newest first). |
| GET | `/notifications/unread-count` | Returns `{ count }` of unread notifications. |
| PATCH | `/notifications/:id/read` | Mark single notification as read. |
| PATCH | `/notifications/read-all` | Mark all notifications as read. |

---

## Providers — `/providers`

Module: `apps/api/src/modules/providers/providers.routes.ts`

All routes require auth.

### Discovery

| Method | Path | Description |
|---|---|---|
| GET | `/providers/connectors` | List available provider connectors (e.g., Syncfy México). |
| GET | `/providers/institutions` | List available institutions. Query: `{ q?, provider?, country?, category? }`. |

### Connections

| Method | Path | Description |
|---|---|---|
| POST | `/providers/connections` | Start a new connection flow. Body: `{ institutionId?, provider? }`. Returns `{ connection: { provider, token, widget?, ... } }`. |
| GET | `/providers/connections/:id/status` | Connection status with account/transaction counts and latest webhook event. |
| POST | `/providers/connections/:id/resync` | Trigger manual resync of a Syncfy connection. |

### Provider accounts

| Method | Path | Description |
|---|---|---|
| GET | `/providers/accounts` | List user's provider accounts. Query: `{ status: "unlinked" }` to filter unlinked. |
| POST | `/providers/accounts/confirm` | Confirm and link provider accounts to FlowLedger accounts. Body: `{ accounts: [{ providerAccountId, accountId? }] }`. Creates Account if `accountId` not provided. |
| POST | `/providers/accounts/:id/resync` | Resync a specific provider account's connection. |

### Syncfy-specific

| Method | Path | Description |
|---|---|---|
| POST | `/providers/syncfy/credentials/:providerCredentialId/refresh` | Trigger credential refresh after manual widget completion. |

---

## Provider Webhooks — `/providers/webhooks`

Module: `apps/api/src/modules/providers/providerWebhooks.routes.ts`

No authentication required (verified via HMAC signature for Syncfy).

| Method | Path | Description |
|---|---|---|
| POST | `/providers/webhooks/:provider` | Ingest provider webhook event. For `syncfy`: verifies HMAC signature, deduplicates events, stores audit record, processes `credentials.refreshed` events asynchronously. |
| GET | `/providers/webhooks/:provider` | Health check — returns `{ success: true, provider, message }`. |

Signature verification result for Syncfy: `"valid"`, `"invalid"`, `"skipped"` (no key configured).

---

## Legacy Syncfy — `/syncfy` (deprecated)

Module: `apps/api/src/modules/providers/syncfy/syncfy.routes.ts`

The legacy `/syncfy` routes exist only for backwards compatibility. They do NOT process provider events. Configure Syncfy to send webhook events to `/providers/webhooks/syncfy`.
