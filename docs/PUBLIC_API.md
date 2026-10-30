# Public REST API (`/v1`)

A small, key-authenticated HTTP surface over your own personal-finance data. Everything not listed here returns `404` (deny by default). `DELETE` exists for transactions, accounts and categories and behaves exactly like the web app's delete (see the table); prefer archiving.

## Authentication

Create a personal API key in the web app (Settings, API keys). Send it on every request:

```
Authorization: Bearer fl_...
```

Only API keys are accepted. Web-session tokens, revoked, expired or unknown keys get `401`.

| Scope | Allows |
|---|---|
| `read` | all `GET` routes |
| `write` | `POST`, `PUT` and `DELETE` (also satisfies `read`) |

A key lacking the scope gets `403` (checked before body validation).

## Endpoints

Base URL: `${PUBLIC_API_URL}/v1`

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/accounts` | read | |
| GET | `/categories` | read | |
| GET | `/transactions` | read | paginated, see below |
| GET | `/transactions/summary` | read | same `query` as the list |
| GET | `/transactions/:id` | read | `404` if not yours |
| POST | `/transactions` | write | `201`, body as in the web API |
| PUT | `/transactions/:id` | write | body as in the web API |
| DELETE | `/transactions/:id` | write | `204`; irreversible, also removes related notifications and the linked shared expense with its participants and settlement requests |
| DELETE | `/accounts/:id` | write | `204`; irreversible, same as the web app: no guards, its transactions are kept but lose their account link (a transfer loses that leg's account), imported-transaction and provider-account links are cleared |
| DELETE | `/categories/:id` | write | `204`; irreversible, same as the web app: its transactions are kept but become uncategorized; group categories need group admin |
| POST | `/accounts` | write | `201` |
| PUT | `/accounts/:id` | write | partial body |
| POST | `/accounts/:id/archive` | write | idempotent |
| POST | `/accounts/:id/restore` | write | idempotent |
| POST | `/categories` | write | `201` |
| PUT | `/categories/:id` | write | partial body |
| POST | `/categories/:id/archive` | write | idempotent |
| POST | `/categories/:id/restore` | write | idempotent |
| GET | `/debts` | read | each list capped at 100 rows, `totals` has the full counts |
| GET | `/reports/summary`, `/reports/by-category`, `/reports/monthly-cashflow` | read | report filters as query params |
| GET | `/currencies` | read | |
| GET | `/currencies/rate?from=USD&to=MXN` | read | |
| GET | `/notifications` | read | 50 newest |
| GET | `/notifications/unread-count` | read | `{ count }`, all unread |
| PATCH | `/notifications/:id/read` | write | `404` if not yours; idempotent |
| PATCH | `/notifications/read-all` | write | `204`; only your notifications |
| GET | `/me` | read | your profile (no password hash) |
| PATCH | `/me` | write | only `name` and `preferredCurrency` (null clears it); at least one required; email, password and plan cannot be changed |
| GET | `/imported-transactions` | read | capped at 100 rows, `total` is the full count |
| PATCH | `/imported-transactions/:id` | write | `{ categoryId }` (null clears); pending rows only, category type must match the row's direction (`400` otherwise) |
| POST | `/imported-transactions/:id/ignore`, `/:id/unignore` | write | pending to ignored and back; `400` if the row is in the wrong status |
| POST | `/imported-transactions/:id/import` | write | `201`; creates a real transaction from a pending row (optional `{ categoryId }`; a category must exist, `400` otherwise); not undoable except by deleting the transaction |
| POST | `/imported-transactions/batch-ignore`, `/batch-unignore`, `/batch-import` | write | body `{ selection: { mode: "ids", ids: [1..50] } }` (+ `categoryId` for import); the web app's `filtered` mode is rejected (`400`). Validation is all-or-nothing: one bad row gives `400` with per-row `errors` and nothing changes. Ids that are not yours are skipped (count `0`), not `404`. Batch import creates the transactions one by one after validation (not one database transaction) |
| GET | `/groups`, `/groups/:id` | read | groups you belong to; detail includes members; `404` if not a member |
| GET | `/shared-expenses`, `/shared-expenses/:id` | read | where you are owner or participant; list capped at 100 rows, `total` is the full count |
| GET | `/users/search?q=&limit=` | read | `q` min 3 chars, `limit` max 10; returns `id`, `name`, `email`; excludes the caller; MCP `search_users` |
| POST | `/groups` | write | `201`; you become admin |
| PUT | `/groups/:id` | write | group admin only; affects all members |
| POST | `/groups/:id/archive`, `/groups/:id/restore` | write | group admin only; idempotent |
| POST | `/groups/:id/members` | write | body `{userId}`; group admin only; `404` non-admin/non-member, `409` already a member, `400` self, unknown user or archived group; the target is notified and gains category access; MCP `add_group_member` |
| POST | `/groups/:id/categories` | write | body `{name, type, color?}`; group admin only; MCP `create_group_category` |
| DELETE | `/groups/:id/members/:userId` | write | `204`; leave yourself, or remove a member as admin; revokes group-category access |
| POST | `/shared-expenses` | write | `201`; only for your own group transactions (`400` otherwise); participants must be group members and are notified |
| POST | `/debts/:id/settlement-request` | write | `201`; debtor only; notifies the creditor |
| POST | `/settlements/:id/approve`, `/settlements/:id/reject` | write | creditor only while pending; approve writes both users' transactions (REST only, no MCP tool) |

Creating records is not idempotent: retrying a failed `POST` may create a duplicate. Group delete, adding members, updating or deleting shared expenses, direct settlement and batch settlement routes are not available (`404`).

Request bodies and responses are identical to the internal `/transactions`, `/accounts` and `/categories` routes. Another user's ids behave like missing ones (`404`).

## Querying and pagination

List and summary routes take a `query` parameter holding a JSON-encoded expression:

```bash
curl -G "$PUBLIC_API_URL/v1/transactions" \
  -H "Authorization: Bearer $FL_KEY" \
  --data-urlencode 'query={"where":{"field":"type","op":"=","value":"expense"},"pagination":{"kind":"offset","page":2,"pageSize":25}}'
```

`GET /v1/transactions` returns at most 100 rows: with no pagination it returns page 1 of 50; a `pageSize` above 100 is reduced to 100; `pageSize < 1`, non-`offset` pagination or malformed JSON return `400`. `meta` reports the total and page count.

## Create a transaction

```bash
curl -X POST "$PUBLIC_API_URL/v1/transactions" \
  -H "Authorization: Bearer $FL_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Coffee","amount":4.5,"type":"expense","date":"2024-01-15","accountId":"<id>","categoryId":"<id>"}'
```

The body is validated by the same schema as the web app, so optional fields such as shared-expense data are accepted too.

## Errors and limits

Errors are JSON: `{ "message": "...", "issues"?: ... }` with status `400`, `401`, `403`, `404`, `429` or `500`. Validation failures use `message: "Validation failed"`. Error bodies never echo your key.

All `/v1` traffic (including unauthenticated) shares a rate limiter, keyed by key hash or IP: 120 requests per minute. Exceeding it returns `429`; see the `RateLimit-*` response headers.

Every `POST`/`PUT`/`DELETE` is written to the server audit log (user, key id, operation, resource id, status; never bodies).

## MCP tools

The MCP server (`/mcp`) exposes the same data. Read credentials get 15 tools (`search_users`, `list_accounts`, `list_categories`, `search_transactions`, `get_transaction_summary`, `list_debts`, `get_report`, `get_exchange_rate`, `list_notifications` (also returns `unreadCount`), `get_transaction`, `list_currencies`, `get_profile`, `list_imported_transactions`, `list_groups`, `list_shared_expenses`); credentials with `write` also get 25 more (`add_group_member`, `create_group_category`, `update_imported_transaction`, `ignore_imported_transactions`, `unignore_imported_transactions`, `import_imported_transactions` (1 to 50 ids; creates real transactions, the assistant is told to confirm with the user), `update_preferences` (name and default currency only), `mark_notifications_read` (`id` or `all: true`), `create_group`, `update_group`, `set_group_archived`, `remove_group_member`, `create_shared_expense`, `request_settlement`, `create_transaction`, `update_transaction`, `delete_transaction`, `delete_account`, `delete_category`, `create_account`, `update_account`, `set_account_archived`, `create_category`, `update_category`, `set_category_archived`). `delete_transaction`, `delete_account`, `delete_category` and `remove_group_member` are marked destructive; the assistant is instructed to get explicit user confirmation first. Tools that notify or affect other users say so in their descriptions; not exposed over MCP: group delete, shared-expense update/delete, direct settle, batch settlement, and approving or rejecting settlements (REST only where a route exists). Every write call is audited as `mcp.<tool>`.
