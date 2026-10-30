## Why

After `expand-personal-api-crud`, agents and API clients can manage personal finances but cannot see or act on groups, shared expenses or settlements. The operator asked for full CRUD coverage over REST `/v1` and MCP for these resources as well, as thin adapters over the existing services. These operations affect other users, so the rules are stricter.

## What Changes

- Add 16 `/v1` routes and 11 MCP tools (parity pass adds user search, member add and group category create). Adapters over existing services and shared Zod schemas; no new auth model, no new scopes (`read`/`write` unchanged), no migrations, no new services, no idempotency store.
- Reads (`read`): `GET /v1/groups`, `GET /v1/groups/:id` (includes members), `GET /v1/shared-expenses`, `GET /v1/shared-expenses/:id`. Settlement requests are already part of `GET /v1/debts` (added by change 1); no separate list service exists.
- Writes (`write`):
  - Groups: `POST /v1/groups`, `PUT /v1/groups/:id`, `POST /v1/groups/:id/archive`, `POST /v1/groups/:id/restore`; admin-only rules come from the existing services.
  - Members: `DELETE /v1/groups/:id/members/:userId` (self-leave, or admin removal).
  - `POST /v1/shared-expenses` (create only).
  - Settlements: `POST /v1/debts/:id/settlement-request` (REST and MCP); `POST /v1/settlements/:id/approve` and `/reject` (REST only).
- MCP tools: `list_groups` (optional `id` returns one group with members), `list_shared_expenses` (optional `id` returns one), `create_group`, `update_group`, `set_group_archived`, `remove_group_member`, `create_shared_expense`, `request_settlement`. Descriptions of every tool that notifies or affects other users say so.
- External `create_shared_expense` is restricted to transactions that belong to a group, so every participant must be a group member. This closes the existing hole where any user id can be made a participant (and notified) outside a group.
- Parity pass (web-user capabilities): `GET /v1/users/search` + `search_users` (`read`; min query 3, max 10 results, id/name/email only), `POST /v1/groups/:id/members` + `add_group_member` (by `userId`, admin only) and `POST /v1/groups/:id/categories` + `create_group_category` (admin only), reusing `getUserSearch`, `postGroupMember`, `postGroupCategory` and the existing services.
- Existing routes and tools unchanged.

## Non-goals and recorded defects

- Hard delete of groups (admin delete orphans `Transaction.groupId` and cascades group categories). Not exposed.
- Add-member by email (account-existence probe) and a role-change or invite flow: not web capabilities. Member add is by `userId` picked from user search only.
- Shared-expense update: excluded until the pre-existing defect in `shared-expenses/services/update.service.ts:60-66` is fixed (it deletes and recreates all participants, losing `paidAmount` and settlement requests). Also excluded: shared-expense delete (cascades settlements).
- `settleDebtDirectly` and batch settlement endpoints: no ledger entries / bulk cross-user writes. Excluded.
- MCP approve/reject: approval writes the counterpart's ledger and is an explicit human action.
- Group category edit/archive/delete (covered by the generic category routes), notifications mark-read.
- Held for operator decision (web allows them, not exposed): shared-expense update (defect #014), group delete (#018), MCP approve/reject (human action), batch settlement request/approval (bulk cross-user writes), `settleDebtDirectly` (ledger and debt diverge; no web button). `remove_group_member` unchanged.
- Pre-existing defects to log in `docs/KNOWN_ISSUES.md`: shared-expense update participant replacement; last-admin removal/self-leave not guarded in `removeGroupMember`; `deleteSharedExpense` leaves notifications; transaction amount change does not rescale participant shares.
- Idempotency keys (retried creates duplicate; documented).

## Capabilities

### New Capabilities
- `mcp-group-tools`: MCP tools for groups, shared expenses and settlement requests.

### Modified Capabilities
- `public-rest-api`: adds the 13 routes to the allowlist, group and settlement rules, and caps for the new lists. The delta is written against the base requirements as modified by `expand-personal-api-crud`.

## Impact

- `apps/api/src/modules/v1/v1.routes.ts` and `v1/controllers/`, `mcp/controllers/` (group tool file), `packages/shared/src/schemas/mcp.ts`, `v1Audit.ts` id capture (`group`, `sharedExpense`, `settlementRequest`).
- **Depends on `expand-personal-api-crud`** (conventions, `capList`, audit capture, debts list, 24-route base). Archive after it.
