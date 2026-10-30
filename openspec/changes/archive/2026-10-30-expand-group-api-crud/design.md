## Context

Conventions come from `expand-personal-api-crud` (adapters over existing controllers/services, `requireScope`, `auditV1Write`, `runWrite`, `capList`). Services here enforce authorization themselves: `getGroupMembership` (404 for non-members), `getGroupAdmin` (404 for non-admins), shared expenses visible to owner or participant, settlement requests creditor/debtor-gated.

## Decisions

1. **Adapters only; authz stays in services.** No duplicated checks. Non-members and non-admins get 404, same as the web app.
2. **Archive, not delete, for groups.** `deleteGroup` is not exposed (orphans transaction group ids, cascades group categories).
3. **Members: remove only.** `removeGroupMember(userId, groupId, memberUserId)` allows self-leave for a member and admin removal. It revokes the removed user's group-category access and does not touch their shared-expense participation (documented). The MCP tool has `destructiveHint: true`. Last-admin removal is not guarded by the service; recorded as a defect, not fixed here.
4. **Shared expenses: read and create.** `createSharedExpense(userId, body)` with `sharedExpenseSchema`. External policy: the adapter loads the owned transaction (`getOwnedTransaction`) and requires `groupId`; otherwise 400. The service then enforces group-member participants and that the owner is not a participant, and the share total must equal the transaction amount. Participants are notified; tool and route docs say so. Update and delete are excluded (see proposal).
5. **Settlements.** `createSettlementRequest(userId, debtId, body)` with `settlementRequestSchema`; the service allows only the debtor, requires outstanding > 0 and no pending request, and validates the debtor's account/category. `approveSettlement` / `rejectSettlement` are creditor-only and need `pending`; approve creates a debtor expense and creditor income transaction in one DB transaction and notifies the counterpart. Approve/reject are REST only, so a conversational agent cannot move money on the user's behalf without a deliberate API call. `request_settlement` is MCP-exposed: it only creates a pending request and notifies the creditor; a repeat is a 400 by the duplicate-pending rule.
6. **Caps.** `GET /v1/shared-expenses` uses `capList(…, 100)` (service is unpaginated). `GET /v1/groups` returns the user's groups (small, user-bound) and is not capped; if the list service later grows pagination this changes. `getGroupById` already bounds its embedded transactions to 25.
7. **Scopes.** Unchanged. A `write` key can approve settlements; accepted because approve is REST only and audited. A dedicated scope is a possible follow-up, not built.
8. **Audit.** Every write route uses `auditV1Write`; id capture extends to `group`, `sharedExpense`, `settlementRequest` response keys (verified in controllers). MCP writes use `runWrite`.

## Resource table

| Operation | REST route | MCP tool | Service | Schema | Scope | Constraints |
|---|---|---|---|---|---|---|
| List groups | `GET /v1/groups` | `list_groups` | `listGroups` | `groupsQueryParamSchema` | read | members only |
| Get group | `GET /v1/groups/:id` | `list_groups` (with `id`) | `getGroupById` | none | read | member; includes members |
| List/get shared expenses | `GET /v1/shared-expenses`, `/:id` | `list_shared_expenses` (optional `id`) | `listSharedExpenses`, `getSharedExpenseById` | `sharedExpensesQueryParamSchema` | read | owner or participant; list capped 100 |
| Create group | `POST /v1/groups` | `create_group` | `createGroup` | `groupSchema` | write | caller becomes admin |
| Update group | `PUT /v1/groups/:id` | `update_group` | `updateGroup` | `updateGroupSchema` (MCP uses its base object) | write | admin |
| Archive/restore group | `POST /v1/groups/:id/{archive,restore}` | `set_group_archived` | `archiveGroup`, `restoreGroup` | none | write | admin; idempotent; affects all members |
| Remove member | `DELETE /v1/groups/:id/members/:userId` | `remove_group_member` | `removeGroupMember` | none | write | self or admin; destructive |
| Search users | `GET /v1/users/search?q=&limit=` | `search_users` | `searchUsers` | `apiUserSearchQuerySchema` (q 3-120, limit max 10) | read | excludes caller; id/name/email only |
| Add member | `POST /v1/groups/:id/members` | `add_group_member` | `addGroupMember` | `groupMemberSchema` | write | admin; not self, user exists, no duplicate, group active; target notified and gains category access |
| Create group category | `POST /v1/groups/:id/categories` | `create_group_category` | `addGroupCategory` | `groupCategorySchema` | write | admin; group active; all members get access |
| Create shared expense | `POST /v1/shared-expenses` | `create_shared_expense` | `createSharedExpense` | `sharedExpenseSchema` | write | group transaction only; notifies participants |
| Request settlement | `POST /v1/debts/:id/settlement-request` | `request_settlement` | `createSettlementRequest` | `settlementRequestSchema` | write | debtor only; notifies creditor |
| Approve / reject | `POST /v1/settlements/:id/{approve,reject}` | none | `approveSettlement`, `rejectSettlement` | `settlementApprovalSchema` / none | write | creditor only; approve writes both ledgers |

REST: 5 reads + 11 writes = 16 new routes. MCP: 3 reads (`id` parameter selects detail, instead of separate get tools; plus `search_users`) + 8 writes = 11 new tools.

User search is a cross-user read of PII. The web allows `q` of 1 character and 25 rows; API credentials get a stricter adapter schema (3 characters, 10 rows) and the same fields the web returns, to limit account enumeration. Member add is by `userId` only, never by email.

## Risks

- Cross-user effects (notifications, counterpart ledger, member access). Mitigated by service authz, REST-only approval, destructive hints, descriptions, audit.
- Members can leave leaving a group without an admin (pre-existing).
- Retried creates duplicate (no idempotency).
