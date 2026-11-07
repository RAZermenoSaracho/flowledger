# Proposal

## Why

With a real user identity, the audited routes scope data correctly: no IDOR was found in the transactions, imports, accounts, groups, debts, settlements, or reports code that was read. What remains is narrower: participants see more of the owner's transaction than they need, the web user search is looser than the API one, and nothing automatically stops a future route from breaking isolation. This change locks in the good state with tests and closes the remaining gaps.

## Findings

Evidence is from production `main` at `9d57822`; `razs_ai` has an identical tree. These are static-review results, not a guarantee of complete coverage.

| ID | Severity | Confidence | Status | Trust boundary | Finding and evidence | Impact |
|---|---|---|---|---|---|---|
| F-11 | Low to Medium | High | Confirmed | Participant to owner's record | Shared-expense reads include the whole transaction: `shared-expenses/services/read.service.ts:116,170`. Debts reads already use `publicTransactionSelect` (`debts/utils/debtInclude.ts:2`). | Participants see the owner's account id, notes, category, and exchange details |
| F-12 | Low to Medium | High | Confirmed, `docs/KNOWN_ISSUES.md` #022 | User to user directory | Web search accepts one character and returns 25 rows; `/v1` and MCP require three and return 10. | Easy enumeration of names and emails |
| F-34 | High | High | Confirmed on staging with synthetic users; same code in production | Participant or group member to another user's record | Sieve queries accept relation paths, so `owner.passwordHash` or `group.owner.passwordHash` in a `where` answers prefix guesses through which rows return. Found while implementing this change. | A participant or group member can recover the owner's bcrypt hash, or read their email and the owner's private transaction fields |
| F-13 | Defense in depth | High | Confirmed | Convention | `settleDebtDirectly` loads, then checks in JS: `debts/services/update.service.ts:45`. Responses are uniform, so nothing leaks. | Departs from the ownership rule |
| F-14 | Defense in depth | High | Confirmed gap | Regression protection | No test proves cross-user denial across modules or that every mount requires authentication. `middleware/tests/auth.test.ts` also had no case for a missing subject. | A future route can silently break isolation |

Reviewed with no finding when `userId` is defined: per-id operations scoped by owner, related ids validated in `transactionValidation.service.ts`, Zod-stripped bodies, owner conditions ANDed around user-supplied sieve queries, no raw SQL in `apps/api/src`, scope checks on `/v1` and MCP, and group-admin checks in the query. The undefined-identity path is fixed by `fix-access-token-purpose-validation`.

## What Changes

- Shared-expense reads return the full transaction to its owner and the public selection to other participants.
- Web user search requires at least three characters and returns at most 10 results, matching the API credential path.
- `settleDebtDirectly` scopes its load by creditor in the query.
- A new integration suite proves authentication is required on every protected mount, and that a second user can neither read nor change another user's records.

## Scope and non-goals

Non-goals, which stay open in `docs/KNOWN_ISSUES.md` because each needs a product decision: #019 (non-group shared expenses can name any user; a fix depends on what relationship should be required), consent before being added to a group, and the self-service `PATCH /users/me/plan` route, since nothing gates on `planType` yet (#036). Also out of scope: data-integrity items #014, #018, #020, and #021, per-service `userId` assertions, and a central authorization layer. Query-level scoping is working, and a second mechanism would duplicate it.

## Capabilities

### New Capabilities
- `financial-data-isolation`: Server-side rules for who can read and change financial records, with the tests that keep them true.

### Modified Capabilities

None.

## Impact

- **API:** `apps/api/src/modules/shared-expenses/services/read.service.ts`, `apps/api/src/modules/debts/services/update.service.ts`, `apps/api/src/modules/users/`, and a new `apps/api/src/tests/integration/financialIsolation.integration.test.ts`.
- **Shared:** the web user-search query schema.
- **Web:** user-search inputs must handle the three-character minimum; shared-expense views must not read owner-only fields for non-owners.
- **Data, dependencies, environment:** none.
