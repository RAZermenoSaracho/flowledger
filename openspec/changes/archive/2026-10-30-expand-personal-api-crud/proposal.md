## Why

The `/v1` REST API and the MCP server cover only accounts, categories and transactions, with 7 routes and 6 tools. Agents cannot create an account or category, correct a mistake by deleting a transaction, or read debts, reports, exchange rates, notifications or the import queue. The operator asked for full CRUD of the personal-finance surface, exposed through both REST and MCP as thin adapters over the existing services.

## What Changes

- Add 19 `/v1` routes (26 in total, before the parity round below) and 14 MCP tools (20 in total, before the parity round), all adapters over existing services and shared Zod schemas. No new auth model, no new scopes, no migrations, no new services.
- Reads (`read` scope):
  - `GET /v1/debts`, `/v1/reports/summary`, `/v1/reports/by-category`, `/v1/reports/monthly-cashflow`, `/v1/currencies`, `/v1/currencies/rate`, `/v1/notifications`, `/v1/imported-transactions`.
  - MCP: `list_debts`, `get_report` (param `type`), `get_exchange_rate`, `list_notifications`, `list_imported_transactions`.
- Writes (`write` scope):
  - Accounts: `POST /v1/accounts`, `PUT /v1/accounts/:id`, `POST /v1/accounts/:id/archive`, `POST /v1/accounts/:id/restore`.
  - Categories: the same four routes under `/v1/categories`.
  - `DELETE /v1/transactions/:id`. **This reverses the MVP exclusion of delete** (explicit operator request).
  - `DELETE /v1/accounts/:id` and `DELETE /v1/categories/:id`: **operator decision** (API/MCP clients with `write` may do what the web UI can). They reuse the internal delete controllers/services unchanged, so authz, validation and errors equal the web app's.
  - MCP: `create_account`, `update_account`, `set_account_archived`, `create_category`, `update_category`, `set_category_archived`, `delete_account`, `delete_category`, `delete_transaction` (the three deletes carry `destructiveHint`).
- Archive remains the recommended soft alternative to deleting an account or category.
- Hardening prerequisite: `body: any` in `createAccount`/`updateAccount`/`createTransaction`/`updateTransaction` becomes the shared-schema type. `fix-repository-lint-errors` task 2.2 covers the same edit; whichever change is implemented first does it and the other skips it (no hard dependency, so the CRUD and lint workstreams stay independent).
- Server-side caps on every new list that is not already bounded.
- Parity round (personal and misc domains, web-user capabilities as the source of truth), still adapters over existing controllers/services with no new scope or migration:
  - Imported-transaction review (`write`): `PATCH /v1/imported-transactions/:id`, `POST /v1/imported-transactions/:id/{ignore,unignore,import}`, `POST /v1/imported-transactions/batch-{ignore,unignore,import}` (ids mode only, 1 to 50 ids). MCP: `update_imported_transaction`, `ignore_imported_transactions`, `unignore_imported_transactions`, `import_imported_transactions`.
  - Notifications: `GET /v1/notifications/unread-count` (read), `PATCH /v1/notifications/:id/read` and `PATCH /v1/notifications/read-all` (write). MCP: `list_notifications` also returns `unreadCount`; new `mark_notifications_read`.
  - Profile: `GET /v1/me` (read), `PATCH /v1/me` (write; name and preferredCurrency only). MCP: `get_profile`, `update_preferences`.
  - MCP reads `get_transaction` and `list_currencies`.
- Existing 7 `/v1` routes and 6 MCP tools are unchanged.

## Non-goals and recorded defects

- No new guard on account/category delete: the web behaviour is preserved as-is (`SetNull` foreign keys, so transactions are unlinked and a transfer loses a leg). That is a pre-existing defect logged as KNOWN_ISSUES #011 and now reachable via API/MCP with the same semantics.
- Account get-by-id: no service exists (list with an id filter works). Not added.
- The web app's `filtered`/"all" selection mode for imported-transaction batches is not exposed (ids only, max 50 per call); import needs the same `write` scope as `POST /transactions` and is documented as creating real transactions.
- Profile email, password, plan, avatar, sidebar side, user search, API keys, OAuth grants, provider connections and webhooks stay excluded.
- Idempotency keys: no create endpoint has one, so a retried `create_*` can duplicate. Deferred (would need a store). Documented in tool descriptions.
- Groups, shared expenses and settlements: see `expand-group-api-crud`.

## Capabilities

### New Capabilities
- `mcp-personal-tools`: the new MCP tools for personal-finance resources.

### Modified Capabilities
- `public-rest-api`: route allowlist (24 routes, DELETE for transactions), scope rule for DELETE, write auditing for DELETE and new writes, plus new requirements for list caps and archive semantics.

## Impact

- `apps/api/src/modules/v1/v1.routes.ts`, a new `v1/controllers/` for the capped list handlers, `v1/utils/v1Audit.ts` (capture created `account`/`category` ids), `mcp/controllers/tools.controller.ts` (split per resource if it grows past readability), a shared `utils/listCap.ts`.
- `packages/shared/src/schemas/mcp.ts`: tool input schemas (`get_report`, `get_exchange_rate`, `list_imported_transactions`, archive toggles).
- Coordinates with (does not depend on) `fix-repository-lint-errors` task 2.2. Depends on `add-mcp-server` / `add-personal-api-keys` being implemented. `openspec/specs/public-rest-api` is the base for the modified requirements. `expand-group-api-crud` depends on this change.
