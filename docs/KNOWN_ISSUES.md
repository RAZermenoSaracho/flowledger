# Known issues

Backlog of things surfaced during work on this repo that were deliberately left unfixed — out of scope for the task that found them, or needing a judgment call before touching. Not a bug tracker for everything wrong with the app; only for issues an agent or contributor found and consciously deferred, so they don't silently disappear into a chat transcript.

Entries are numbered sequentially and never renumbered. Mark `[OPEN]` while unresolved, `[RESOLVED]` once fixed (leave the entry in place with its status flipped, don't delete it — it's the record of what was decided and why).

---

## [OPEN] #001 — Status enum values rendered as lowercase plain text

**Found in:** Task 2 (transaction-form category filtering + Type-field capitalization pass), while auditing every plain-text display of an enum value across the app.

**Scope:**
- `apps/web/src/pages/Transactions/TransactionDetailPage.tsx:180` — `transaction.sharedExpense.status` (`SharedExpenseStatus`: `"open"|"settled"|"cancelled"`)
- `apps/web/src/pages/SharedExpenses/components/SharedExpenseListItem.tsx:43` — `sharedExpense.status` (same enum)
- `apps/web/src/pages/Debts/components/SettlementRequestCard.tsx:53` — `request.status` (`SettlementStatus`: `"pending"|"approved"|"rejected"`)

**Description:** These three locations render a status enum value directly as text (e.g. `{sharedExpense.status}`), with no capitalization and no Tailwind `capitalize` class, so they display the raw lowercase API value ("open", "settled", "pending", etc.) instead of a human-readable label. This is the same underlying bug class as the Type-field lowercase issue fixed in Task 2 (`apps/web/src/utils/enumLabels.ts`'s `formatEnumLabel()`), just on Status enums instead of Type enums — Task 2 was explicitly scoped to Type fields only, so these were found but not fixed.

**Suggested fix:** Wrap each with `formatEnumLabel()` from `apps/web/src/utils/enumLabels.ts`, the same helper already used for Type fields. Since none of these values contain underscores, this is a mechanical, low-risk swap — no new logic needed. Check for existing tests asserting the current lowercase text before changing (Task 2 found two such tests for the Type-field fix and had to update them).

---

## [OPEN] #002 — Account/imported-transaction type-and-status text uses an older `.replace()` + Tailwind `capitalize` pattern instead of the shared `formatEnumLabel()` helper

**Found in:** Task 2, same audit pass as #001.

**Scope:**
- `apps/web/src/pages/Accounts/components/AccountListItem.tsx` (~line 177-179): `{account.type.replace("_", " ")} · {account.currency}` inside a `<p className="... capitalize ...">`
- `apps/web/src/pages/Accounts/components/AddAccountCard.tsx` (~line 246-248): same pattern for `providerAccount.type`
- `apps/web/src/pages/Transactions/components/ImportedTransactionCard.tsx` (~line 101-107): `{transaction.status}` inside a `<span className="... capitalize ...">` (`PROVIDER_IMPORTED_TRANSACTION_STATUSES`: `"pending"|"processed"|"ignored"`)

**Description:** These three currently render *correctly* — `ACCOUNT_TYPES`' only multi-word value (`credit_card`) becomes "credit card" via `.replace("_", " ")` and then "Credit Card" via the CSS `capitalize` class; the imported-transaction statuses are all single words so `capitalize` alone is sufficient. So this is not a display bug today. It is, however, a second, different mechanism for the same "format an enum value for display" problem that `apps/web/src/utils/enumLabels.ts`'s `formatEnumLabel()` was written to solve in Task 2 — these three sites don't use it. Latent risk: `.replace("_", " ")` only replaces the *first* underscore (not `replaceAll`), so this would silently break if `ACCOUNT_TYPES` ever gained a value with two or more underscores.

**Suggested fix:** Swap all three to `formatEnumLabel()` and drop the Tailwind `capitalize` class (redundant once the label is pre-capitalized in JS) for consistency with every other enum-value display in the app. Purely a consistency/de-duplication cleanup, not a bug fix — low priority.

---

## [OPEN] #003 — `debtDisplay.ts`'s `statusLabel()` mixes hand-written phrases with a raw enum fallback

**Found in:** Task 2, same audit pass as #001.

**Scope:** `apps/web/src/pages/Debts/utils/debtDisplay.ts` (~line 76-80), `statusLabel()`, used by `apps/web/src/pages/Debts/components/DebtSummaryCard.tsx:36` and `apps/web/src/pages/Debts/components/DebtTable.tsx:113`.

**Description:** `statusLabel()` returns a deliberately-lowercase, hand-written phrase for two of `SettlementStatus`'s three values (e.g. `"settled"`, `"settlement pending"` — these read as natural sentence fragments in their UI context, not as capitalized labels) and falls back to the raw `debt.status` enum value for the third. Mechanically wrapping just the fallback branch in `formatEnumLabel()` would capitalize only one of the three possible outputs shown in the same UI slot, which would look inconsistent rather than fixing anything.

**Suggested fix:** TBD — needs a product/design call on what all three states should actually read as in this specific UI slot (e.g. should all three be capitalized short labels instead of lowercase phrases? Should the two hand-written phrases stay as-is and only the fallback get a proper label?) before touching the code.

---

## [OPEN] #004 — `ImportedTransactionCard` has a multi-button action cluster that doesn't use `RecordCard`

**Found in:** Task 8 (RecordCard responsive collapse investigation), while auditing every card/list-row in the app for actions containers not going through the shared `RecordCard` component.

**Scope:** `apps/web/src/pages/Transactions/components/ImportedTransactionCard.tsx` (pending-status branch, ~line 149-167: Import/Ignore buttons).

**Description:** This card has a genuine 2-button, plain-`onClick` action cluster (Import/Ignore) — architecturally the right shape for `RecordCard`'s `actions` prop — but the card itself uses a hand-rolled 3-column grid (`md:grid-cols-[auto_minmax(0,1fr)_auto]`: checkbox | description+metadata | amount+category-select+buttons), not `RecordCard`'s single-row leading/title/subtitle/trailing/actions layout. The buttons currently always render full-width/stacked (`grid gap-2 sm:grid-cols-2`) with no collapse behavior at any width. Migrating this to `RecordCard` isn't a simple prop swap: the right-hand column stacks a `SelectField` (category picker) *above* the buttons, and `RecordCard`'s `actions` are button-only — the select would need to move into `children`, which renders *below* the entire row, not inline in a right-hand column above the actions. That's a real layout redesign, not a prop-mapping migration.

**Suggested fix:** TBD — needs a decision on whether to (a) redesign this card's layout to fit `RecordCard`'s row+children shape (changing its current three-zone visual structure), or (b) leave it as its own pattern since it's a denser, form-embedded card unlike a typical list-row. Not attempted in Task 8 to avoid an unrequested visual redesign of an actively-used review queue.

---

## [OPEN] #005 — `GroupHeader`'s action buttons are structurally RecordCard-shaped but not a list-row

**Found in:** Task 8, same audit pass as #004.

**Scope:** `apps/web/src/pages/Groups/components/GroupHeader.tsx` (~line 68-105: Edit / Archive-or-Restore / Delete buttons).

**Description:** Three plain `onClick` buttons, no attached form — the closest structural match to `RecordCard`'s action shape found anywhere in the audit besides the four already-migrated call sites. It currently wraps via a manual `flex-col sm:flex-row` breakpoint (no measured collapse, no three-dot fallback), so a long group name plus three buttons can wrap awkwardly on a narrow screen. However, it's the header for whichever single group is currently selected (never one row among many), which doesn't match `RecordCard`'s "list-row" purpose/shape (title truncation, leading icon slot, etc. designed around compact repeated rows).

**Suggested fix:** TBD — needs a call on whether `RecordCard` should be generalized to also serve as a generic "title + actions" block (not just list-rows), or whether this should get its own, simpler width-based collapse rather than reusing `RecordCard`. Not migrated in Task 8 since it isn't a clean fit for the current list-row-shaped component.

---

## [OPEN] #006 — `apiRequest`'s `/auth/*` retry-exclusion is broader than necessary

**Found in:** Task 10 (auth token expiry investigation and fix).

**Scope:** `apps/web/src/services/api.client.ts`'s `apiRequest`, the `!path.startsWith("/auth/")` condition gating the 401 silent-refresh-and-retry logic.

**Description:** This exclusion exists to stop `/auth/login`, `/auth/register`, and `/auth/refresh` 401s from triggering a retry-refresh loop (login/register 401s are user-input errors, not session expiry; retry-refreshing on `/auth/refresh`'s own failure would be nonsensical). But the blanket `/auth/` prefix also excludes `/auth/me` and `/auth/logout` from the retry-refresh path, neither of which needs excluding — `/auth/me` genuinely requires a valid access token like any other authenticated endpoint. Currently harmless: `/auth/me` is only ever called immediately after a successful refresh/OAuth callback, when the token is guaranteed fresh. But if a future caller invoked it with a stale token, it would 401 without attempting a silent refresh first, unlike every other authenticated endpoint.

**Suggested fix:** Narrow the exclusion to the exact three paths that need it (`/auth/login`, `/auth/register`, `/auth/refresh`) instead of the whole `/auth/` prefix. Low priority — no observed bug, purely a latent inconsistency.

---

## [RESOLVED] #007 — Web login lacks rate limiting and refresh tokens lack reuse detection

**Resolved:** Login, registration, refresh and credential changes are rate limited, and replay after a 60-second grace period revokes descendant tokens (`harden-account-identity-and-sessions`).

**Found in:** Personal API key auth documentation pass.

**Scope:** `POST /auth/login` and refresh token rotation in `POST /auth/refresh`.

**Description:** Web login has no rate limiting. Refresh tokens are rotated, but there is no token family tracking or reuse detection to revoke a session after a previously used token is replayed.

**Suggested fix:** Rate-limit login attempts and add refresh token family tracking with reuse detection and family revocation. Since B-002, a rotated token stays valid until its successor is first used, and `RefreshToken.previousTokenId` links one rotation step, so detection should treat replay of a token with an unused successor as legitimate.

---

## [RESOLVED] #008 — Repo-wide `npm run lint` fails on pre-existing errors

**Found in:** Verification pass for the personal API keys change.

**Scope:** Whole monorepo `npm run lint` (81 errors, 11 warnings at the time of logging). Examples: unused `waitFor` imports in web tests, `any` in accounts/transactions services, an unused `Prisma` import in `reports.types.ts`, and CommonJS globals in `.agents/skills/*.cjs`.

**Description:** None of the errors are in files touched by the API keys change; files added or changed by that change lint clean. Because the root command fails, it cannot be used as a pass/fail gate until these are cleaned up.

**Resolution:** `fix-repository-lint-errors`: ESLint ignores local worktrees and vendored skill tooling, `npm run lint` runs with `--max-warnings 0`, and the remaining source errors and warnings were fixed.

---

## [OPEN] #009 — Full parallel `npm run test` can time out a web test worker

**Found in:** Verification pass for the personal API keys change.

**Scope:** `apps/web/src/pages/Debts/hooks/tests/useDebtSettlementWorkflow.test.tsx` when the root `npm run test` runs all workspaces, including the Docker-backed API suites, at once.

**Description:** In one full run every test passed, but Vitest reported "Worker exited unexpectedly" / "Timeout terminating forks worker" for this file, so the command exited non-zero. Running `npm run test -w apps/web` on its own passed (112 files, 858 tests). This looks resource-related rather than a code defect.

**Suggested fix:** Investigate the worker timeout (pool size or teardown in that test), or run the workspace suites sequentially in the root script.

---

## [OPEN] #010 — No dynamic client registration and no `iss` on SDK-generated OAuth error redirects

**Found in:** MCP OAuth server change.

**Scope:** `apps/api/src/modules/oauth/`.

**Description:** Clients are identified only by Client ID Metadata Documents; clients that need RFC 7591 registration cannot connect. Errors the MCP SDK redirects itself (for example `invalid_request`, `invalid_target`) do not carry the RFC 9207 `iss` parameter; only approve and deny redirects built by FlowLedger do. Unfinished grants (code never exchanged) are never cleaned up.

**Suggested fix:** Add DCR only if a required client needs it; wrap the SDK authorize handler to append `iss`; add a periodic `deleteMany` of expired unfinished grants.

---

## [OPEN] #011 — Hard delete of accounts and categories orphans transactions

**Found in:** `expand-personal-api-crud` design review.

**Scope:** `deleteAccount` and `deleteCategory` services (internal `DELETE /accounts/:id`, `/categories/:id`). Also exposed through `DELETE /v1/accounts/:id`, `DELETE /v1/categories/:id` and the MCP tools `delete_account`, `delete_category` with exactly the same semantics as the web UI (operator decision: API/MCP clients may do what the web UI can).

**Description:** The foreign keys use `SetNull`, so transactions of a deleted account or category are silently orphaned and a transfer loses a leg.

**Suggested fix:** Block the delete when transactions exist, or require archiving first.

---

## [OPEN] #012 — Create endpoints and tools have no idempotency key

**Found in:** `expand-personal-api-crud` design review.

**Scope:** `POST /v1/accounts`, `/v1/categories`, `/v1/transactions` and the matching `create_*` MCP tools.

**Description:** A retried create after a timeout can duplicate the record. Tool descriptions and docs say so.

**Suggested fix:** Accept an optional idempotency key and keep a short-lived store of results.

---

## [RESOLVED] #013 — Account currency can be changed on an account that has transactions

**Found in:** `expand-personal-api-crud` design review.

**Scope:** `updateAccount`, reachable from the web app, `PUT /v1/accounts/:id` and `update_account`.

**Description:** Changing `currency` does not re-evaluate existing transactions or balances.

**Suggested fix:** Reject currency changes once the account has transactions.

**Resolution:** `updateAccount` returns 400 naming `currency` while any transaction references the account (ST-023).

---

## [OPEN] #014 — Shared-expense update replaces all participants

**Found in:** `expand-group-api-crud`.

**Scope:** `updateSharedExpense` (`shared-expenses/services/update.service.ts:60-66`); web `PUT /shared-expenses/:id`. Not exposed through `/v1` or MCP.

**Description:** Replacing participants deletes and recreates them, losing `paidAmount` and cascading away their settlement requests.

**Suggested fix:** Diff participants and update in place, rejecting changes that would drop paid or requested shares.

---

## [OPEN] #015 — Last admin can be removed or can leave a group

**Found in:** `expand-group-api-crud`.

**Scope:** `removeGroupMember` (`groups/services/delete.service.ts`); web `DELETE /groups/:id/members/:userId`, `DELETE /v1/groups/:id/members/:userId`, `remove_group_member`.

**Description:** There is no last-admin guard, so a group can end up with no admin and become unmanageable.

**Suggested fix:** Refuse removal of the only admin, or promote another member first.

---

## [OPEN] #016 — `deleteSharedExpense` leaves its notifications

**Found in:** `expand-group-api-crud`.

**Scope:** `deleteSharedExpense` (web only).

**Description:** Notifications created for participants remain after the shared expense is deleted.

**Suggested fix:** Delete related notifications in the same database transaction, as `deleteTransaction` does.

---

## [RESOLVED] #017 — Changing a transaction amount does not rescale participant shares

**Resolved:** `updateTransaction` rejects with a 400 on `amount` an amount below the sum of existing participant shares, on the web API, `/v1` and MCP; the transaction view shows it on the amount field (`st007-transaction-form-view`).

**Found in:** `expand-group-api-crud`.

**Scope:** `updateTransaction` on a transaction with a shared expense (web, `PUT /v1/transactions/:id`, `update_transaction`).

**Description:** Share amounts keep their old values, so shares can exceed the new amount.

**Suggested fix:** Reject amount changes that would make shares exceed the amount, or rescale proportionally.

---

## [OPEN] #018 — Group hard delete orphans transaction group ids

**Found in:** `expand-group-api-crud`.

**Scope:** `deleteGroup` (web `DELETE /groups/:id`); not exposed through `/v1` or MCP.

**Description:** Deleting a group cascades its categories and leaves `Transaction.groupId` pointing at nothing.

**Suggested fix:** Block deletion while transactions reference the group, or archive instead.

---

## [BY DESIGN] #019 — Shared expenses on non-group transactions accept any user id as participant

**Found in:** `expand-group-api-crud`.

**Scope:** `createSharedExpense` via the web `POST /shared-expenses`; `normalizeSharedExpenseParticipants` only checks membership when the transaction has a group.

**Description:** Any existing user id can be made a participant and is notified. `/v1` and MCP refuse non-group transactions (400); the web path is unchanged.

**Suggested fix:** Require a shared relationship (group, contact) in the service so the web path is covered too.

**Status update:** Reclassified as intentional, supported behavior. Universal invitations are a product decision, protected by participant consent, user blocking and public-identity privacy in B-004 ST-003; `/v1` and MCP will follow the same rule. No fix is planned. (`[BY DESIGN]` is used here because the entry is neither open nor a fix.)

---

## [OPEN] #020 — Shared-expense shares may be below the transaction amount, and `getGroupById` answers non-members with 400

**Found in:** `expand-group-api-crud`.

**Scope:** `validateSharedExpenseParticipants` only rejects shares above the amount (the owner keeps the remainder); `getGroupMembership` returns 400 for non-members. `/v1/groups/:id` and `list_groups` map non-members to 404 through `getMemberGroup`.

**Description:** Behaviour differs from the original change text (shares equal the amount; 404 everywhere).

**Suggested fix:** Decide whether partial shares are intended and align `getGroupMembership` with the 404 convention.

---

## [OPEN] #021 — Imported-transaction batch import is not atomic and batch calls skip unknown ids silently

**Found in:** `expand-personal-api-crud`.

**Scope:** `batchImportProviderImportedTransactions`, `batchIgnoreImportedTransactions`, `batchUnignoreImportedTransactions` (web `POST /transactions/imported/batch-*`, `/v1/imported-transactions/batch-*`, MCP `*_imported_transactions`).

**Description:** Every row is validated up front and any failure aborts with per-row errors before anything changes. After validation, batch import creates the transactions one at a time (each in its own database transaction), so a crash or database error midway leaves a partial import; re-running is safe because processed rows are rejected. Ids that do not exist or belong to another user are dropped by `resolveImportedTransactionSelectionIds`, so the call succeeds with a smaller count instead of answering `404`.

**Suggested fix:** Run the creation loop in one `$transaction` and report requested vs. resolved id counts.

---

## [RESOLVED] #022 — Web user search is looser than the API-credential search

**Resolved:** Web user search now requires three characters and returns at most 10 results (`enforce-financial-data-isolation`).

**Found in:** `expand-group-api-crud`.

**Scope:** web user search vs. `GET /v1/users/search` and MCP `search_users`.

**Description:** The web search accepts a 1-character query and returns up to 25 rows; API credentials get a 3-character minimum and at most 10 rows.

**Suggested fix:** Apply the same minimum and cap on the web path if enumeration is a concern.

---

## [OPEN] #023 — Shared-expense update (#014) and group delete (#018) are intentionally not exposed over `/v1` and MCP

**Found in:** `expand-group-api-crud`.

**Scope:** `/v1`, MCP.

**Description:** Both are withheld pending an operator decision because of the issues logged in #014 and #018.

**Suggested fix:** Expose them once #014 and #018 are resolved.

---

## [OPEN] #024 — Legacy and date-only transactions display, filter, and bucket as UTC instants

**Found in:** `fix-transaction-date-display`.

**Scope:** `Transaction.date` records stored at UTC midnight; API `/v1` and MCP date-only writes; web display, filters, and monthly cashflow.

**Description:** Existing UTC-midnight records and bare-date API/MCP writes are read as the instants they hold, so in negative UTC offsets they can show the previous local day, and those on the first of a month can count in the previous month.

**Suggested fix:** No cleanup is planned. Rewriting or reinterpreting existing data needs separate approval.


---

## [OPEN] #025 — Syncfy dates arrive at exactly UTC noon with no execution time

**Found in:** `fix-transaction-date-display`.

**Scope:** Syncfy-imported transactions (`ProviderImportedTransaction.transactionDate` and linked `Transaction.date`).

**Description:** All staging imported rows have `dt_transaction` at exactly UTC noon (confirmed only in local staging; production was not inspected). They display without a time while unedited, but the edit picker still shows a local time such as 6:00 AM. Filters and reports treat them as instants, and viewers at UTC+12 or beyond see the next calendar day.

**Suggested fix:** Confirm the provider behavior in production, then decide whether provider dates need a date-only representation.


---

## [OPEN] #026 — `search_transactions`, `get_transaction_summary`, and report range filters have no timezone parameter

**Found in:** `fix-transaction-date-display`.

**Scope:** MCP `search_transactions` and `get_transaction_summary`; report range filters on REST and `/v1`.

**Description:** Only monthly cashflow accepts `timeZone`. For other range filters, API clients must send datetimes to select a local day; bare dates mean whole UTC days.

**Suggested fix:** Add an optional `timeZone` to these filters if API clients need local-day ranges without computing instants.


---

## [RESOLVED] #027 — `SYNCFY_AUTO_SYNC_ENABLED=false` enables the auto-sync scheduler

**Found in:** `fix-transaction-date-display`.

**Scope:** `apps/api/src/config/env.ts` (line 70) and the Syncfy auto-sync scheduler.

**Description:** `SYNCFY_AUTO_SYNC_ENABLED` is parsed with `z.coerce.boolean()`, so the string `"false"` becomes `true` and the scheduler runs whenever the variable is set to any non-empty value, including `false`. During QA, a throwaway instance started with `false` ran one scheduler job that made one outbound Syncfy `GET /v1/accounts` call, which returned 402, and wrote no data.

**Workaround:** Leave the variable empty or unset.

**Suggested fix:** Parse the string explicitly (for example `z.enum(["true", "false"]).transform((v) => v === "true")`).

**Resolution:** `fix-filter-usability-and-autosync-flag`: `SYNCFY_AUTO_SYNC_ENABLED` is parsed explicitly; `false` starts no scheduler and makes no Syncfy call, and an invalid value fails startup (verified in QA).


---

## [RESOLVED] #028 — Groups page filter modal appears behind parts of the selected group's form

**Found in:** `fix-transaction-date-display` PR review. It is an existing production bug; this PR did not cause it.

**Scope:** `apps/web/src/pages/Groups/GroupsPage.tsx`, `GroupsListCard.tsx`, and the shared `FilterBuilder` modal.

**Description:** On the Groups page, opening the filter modal from the group list leaves it partly covered by the selected group's detail form, so stacking and overlap are wrong. The page shows the list and the detail side by side at `xl`, with the list column wrapped in `xl:sticky xl:top-6`. Not reproduced or verified in this session. Plausible: the sticky wrapper forms its own stacking context, so the modal's `fixed z-50` (`FilterBuilder.tsx`) is confined to it and can paint under positioned elements in the detail `Card`. `<main>` overflow changed in this PR (`overflow-x-clip`); there is no evidence it is involved.

**Resolved:** The Group overview redesign (ST-024, B-004) removes the side-by-side layout and sticky column; the filter dropdown and modal were verified above all content on the overview and detail views at 375px and 1440px.

**Scope:** `apps/web/src/components/FilterBuilder.tsx` (the "Filters" modal).

**Description:** The modal has no Escape-key handling and no focus management: Escape does nothing, focus is not moved in on open or returned to the trigger on close. Found in browser QA; present before the date-filter changes.

**Suggested fix:** Close on Escape and return focus to the opener, matching the Reports popover.

---

## [RESOLVED] #029 — Refresh token rows are never deleted

**Resolved:** Issuing a refresh token now deletes that user's expired rows (`harden-account-identity-and-sessions`).

**Found in:** B-002 discovery.

**Scope:** `RefreshToken` table.

**Description:** Expired and revoked rows stay forever, because each refresh adds a row. `flowledger_staging` held 663 rows for 2 users on 2026-11-06.

**Suggested fix:** Periodically delete rows whose `expiresAt` has passed.

---

## [OPEN] #030 — Light flash before the dark theme applies

**Found in:** B-002 discovery.

**Scope:** `apps/web/index.html`, `hooks/useTheme.tsx`.

**Description:** The `dark` class and `color-scheme` are applied in an effect after React mounts, so dark-mode users can see a light page first.

**Suggested fix:** Apply the stored theme in a small inline script in `index.html`.

---

## [RESOLVED] #031 — A failed logout request leaves the session alive

**Resolved:** A failed logout now shows an error and keeps the session (`harden-account-identity-and-sessions`).

**Found in:** B-002 security audit.

**Scope:** `apps/web/src/hooks/useAuth.tsx` `logout`, `services/auth.client.ts`.

**Description:** If `POST /auth/logout` fails (offline, 5xx), `logout` rethrows after clearing the access token, so `setUser(null)` never runs and the refresh cookie and token stay valid. The next 401 silently refreshes, so a user who believes they signed out may remain signed in. Persistent sessions make this matter more. Signing out only the UI wouldn't fix it, because the server token stays valid and a reload restores it.

**Suggested fix:** Show a clear "couldn't sign out" error, and retry revocation when the connection returns.

---

## [RESOLVED] #032 — Landing gateway still ignores the session presence cookie

**Resolved:** The gateway change is on a landing-repository branch and takes effect when the gateway is deployed (`route-authenticated-root-and-remove-oauth-url-token`).

**Found in:** B-002 discovery.

**Scope:** `flowledger_landing/server/gateway.js` (separate repo).

**Description:** The gateway looks for `flowledger_refresh_token` on `/`, but that cookie is `Path=/auth` and never reaches it, so a signed-in user opening `/` gets the landing page. "Log in" then forwards them straight into the app, which costs one extra click.

**Suggested fix:** Change the gateway's `REFRESH_TOKEN_COOKIE_NAME` to `flowledger_session`, which the API now sets on `Path=/`, and deploy it after the API.

---

## [OPEN] #033 — No email verification or password reset

**Found in:** Security audit, 2026-11-07.

**Scope:** `auth/services/create.service.ts`, `users/services/update.service.ts`; the API has no mail-sending code.

**Description:** Accounts never prove they own their address, and there is no reset path. `harden-account-identity-and-sessions` stops Google sign-in from merging into an unlinked account, but someone registering a victim's address first can still block that person from using it. A user who forgets a password has no recovery path.

**Suggested fix:** TBD. Needs an owner decision on a mail provider; then add verification and reset together, and resolve squatted addresses through verified ownership.

---

## [OPEN] #034 — Other sibling-subdomain cookie risks remain after the refresh cookie is host-only

**Found in:** Security audit, 2026-11-07.

**Scope:** `auth/providers/google/utils/googleStateCookie.ts`, session cookies, other `razs.dev` applications.

**Description:** A compromised `razs.dev` sibling can plant cookies for FlowLedger's hosts, which could sign a browser into an attacker's session or tamper with Google state. It needs a compromised sibling first. `__Host-` isn't usable for the refresh cookie, because it requires `Path=/`.

**Suggested fix:** Keep the sibling inventory tight. Longer term, move FlowLedger to its own registrable domain, which also removes the shared-cookie concern.

---

## [OPEN] #035 — API keys and OAuth grants survive a password change

**Found in:** Security audit, 2026-11-07.

**Scope:** `users/services/update.service.ts` `updatePassword`.

**Description:** A password change revokes refresh tokens only. A key or grant created by an attacker keeps working until revoked by hand, which is defensible because they are separately visible credentials, but a user recovering from a compromise has to know to check them.

**Suggested fix:** Offer "also revoke API keys and connected apps" on password change.

---

## [OPEN] #036 — Any user can set their own plan

**Found in:** Security audit, 2026-11-07.

**Scope:** `PATCH /users/me/plan`, `users/services/update.service.ts`.

**Description:** Any signed-in user can select `flowledger_one` with no payment or admin check. Nothing gates on `planType` today, so this has no current impact.

**Suggested fix:** Make the field server-controlled before any feature depends on it.

---

## [OPEN] #037 — Group members are added without consent

**Found in:** Security audit, 2026-11-07.

**Scope:** `addGroupMember`.

**Description:** A group admin can add a user immediately without consent. Email exposure is fixed: members are public identities (`id`, `username`, `displayName`). Group membership grants access independently of shared-expense consent.

**Suggested fix:** A future product decision may add Group invitations. Group add remains immediate; shared-expense proposals have their own accept/reject flow and universal sharing does not grant Group access.

**Update:** The email exposure is addressed by B-004 ST-003's public identity; group-add consent stays open.

---

## [OPEN] #038 — Mixed-case emails can create separate accounts

**Found in:** Security audit, 2026-11-07.

**Scope:** `registerSchema`, `loginSchema`, `authenticateUser`.

**Description:** Registration and login keep the email's letter case, while Google matching is case-insensitive. Addresses differing only in case can become separate password accounts. Lowercasing input alone would lock out any existing mixed-case account.

**Suggested fix:** Check production for mixed-case and colliding emails, normalize stored values with a migration, then lowercase in the shared schemas.

---

## [OPEN] #039 — MCP consent request isn't bound to a user or single use

**Found in:** Security audit, 2026-11-07.

**Scope:** `oauth/utils/consentRequest.ts`.

**Description:** The signed consent request has no user binding and can be reused for 10 minutes. The user must still review the client and approve, so this is ordinary consent-phishing exposure rather than a bypass.

**Suggested fix:** Bind it to the session and add a single-use id if MCP use grows.

---

## [OPEN] #040 — Remaining dependency advisories after non-major updates

**Found in:** Security audit, 2026-11-07.

**Scope:** `zod` (3.x, memory use on oversized collections; the fix is a major upgrade), `@syncfy/authentication-widget` (no fix available, and it installs testing and Vue dependencies in production).

**Description:** `npm audit --omit=dev` reported 29 high advisories before updates and 11 after (16 in total). What remains: `zod`; `prisma` through `@prisma/config` and `deepmerge-ts`, where 6.19.3 is already the newest 6.x; and `firebase`, `@grpc/grpc-js`, `cypress`, and `extract-zip`, all under the Syncfy widget. Reachability wasn't verified per advisory. Request bodies are limited to 1 MB, which bounds the `zod` issue. `prisma`'s path is a build-time CLI, not an API request path.

**Suggested fix:** Plan the `zod` 4 migration separately, and ask Syncfy for a slimmer widget package or isolate its tree.

---

## [OPEN] #041 — Raw errors are written to logs

**Found in:** Security audit, 2026-11-07.

**Scope:** `middleware/errorHandler.ts`, `mcp/utils/toolResult.ts`.

**Description:** `console.error(error)` logs whole error objects. Prisma errors may include query values such as financial fields. Whether they do in practice wasn't verified.

**Suggested fix:** Log the error name, code, and stack, without Prisma's message text and metadata.

---

## [OPEN] #042 — Replaced avatars stay public and keep their metadata

**Found in:** Security audit, 2026-11-07.

**Scope:** `users/services/update.service.ts`, `/uploads`.

**Description:** Old avatar files aren't deleted, `/uploads` is public, and images aren't re-encoded, so EXIF data such as location can remain.

**Suggested fix:** Delete the previous file on replacement, and strip metadata if an image library is added for other reasons.

---

## [OPEN] #045 — Two remaining gaps from the hardening review

**Found in:** Security review of the hardening branch, 2026-11-07.

**Description:** (1) Case-variant emails can still race past the case-insensitive check in `updateEmail` and registration, because the database constraint is case-sensitive; #038 covers the fix. (2) The Google link callback doesn't confirm that the caller is `linkUserId`. A browser holding an attacker's state nonce could link its Google identity to the attacker's account, which needs cookie planting from a sibling subdomain (#034).

**Suggested fix:** A case-insensitive unique index with #038. For the link, compare against the session once #034 is addressed.

---

## [OPEN] #043 — `package-lock.json` is gitignored, so installs can't be pinned

**Found in:** Implementing `harden-api-and-deployment-config`, 2026-11-07.

**Scope:** root `.gitignore`, `~/scripts/deploy-flowledger-prod.sh`.

**Description:** The lockfile isn't tracked, so production resolves versions from its own untracked copy and `npm ci` isn't possible. Security updates therefore have to raise minimums in `package.json`, or use root `overrides` for transitive packages, to reach production.

**Suggested fix:** Track the lockfile and switch the deploy script to `npm ci`, together. Remove production's untracked `package-lock.json` right before that merge: `git pull` in the deploy script stops if a tracked file would overwrite an untracked one.

---

## [OPEN] #044 — Large result sets are cut off at fixed limits

**Found in:** Implementing `harden-api-and-deployment-config`, 2026-11-07. Narrowed by `b004-list-pagination`, 2026-11-12.

**Scope:** `reports/services/read.service.ts` (100,000 rows for cashflow); unpaginated lists: `GET /shared-expenses`, `GET /debts`, `GET /groups`, and `/v1` + MCP imported transactions without `pagination`.

**Description:** The Transactions, Imported Transactions and Related transactions lists are now server-paginated. A request without `pagination` still returns up to 10,000 transactions (legacy default). Past 100,000, the cashflow report covers only the oldest rows. Shared expenses, Debts (three unbounded queries with balances computed in memory) and the Groups overview load the user's whole collection.

**Suggested fix:** Aggregate the cashflow report in SQL if the limit is approached. Paginate shared expenses through its existing sieve call (`pagination` plus the shared web `Pagination`). Rewrite Debts as paged queries if volumes grow. Upstream `createSieve`'s page-size bound and `id` tie-breaker into a datasieve release.

---

## [OPEN] #046 — Security hardening follow-ups left for the owner

**Found in:** Closing the security initiative, 2026-11-07.

**Description:** Done on 2026-11-09:
- Google sign-in has been tested on desktop and mobile.
- Cloudflare redirects HTTP to HTTPS (308) for `flowledger.razs.dev` and `api-flowledger.razs.dev`.
- Minimum TLS is 1.2 zone-wide. Setting it per host needs Advanced Certificate Manager.
- The production `.env` and `.env.backup.*` files are `600`.
- `main` is protected against force pushes and deletion. Admins aren't enforced and no status check is required, since the only workflow is the deploy that runs after a push.
- Cloudflare Access (Google, owner only) covers `flowledger-dev.razs.dev`.
- The landing deploy uses `npm ci`.
- The gateway sends `Strict-Transport-Security: max-age=31536000`, without `includeSubDomains` or preload.
- Application pages enforce a script-restricting CSP in production (PRs #35 and #37). The landing pages stay report-only.

Still open:
- Owner check of the enforced CSP with real credentials. Connect or resync a bank through the Syncfy widget, sign in with Google, approve an MCP consent from claude.ai, and use the installed iOS app, watching DevTools for "Refused to…" errors. Signed-out production checks found no violations. If something is blocked, add its host to `appContentSecurityPolicy` in `apps/web/vite.config.ts`.
- The gateway's report-only CSP also covers app pages and flags the Syncfy and Cloudflare beacon hosts. This is console noise only, since the enforced app policy governs. Scoping it to landing paths would quiet it.
- MCP consent has no step-up re-authentication. An XSS, which isn't confirmed but would be the precondition, could approve a grant for an attacker-hosted client. Any new grant appears in Connected apps, where it can be revoked.
- The access-log review for past F-01 and F-34 use, which logs can't fully rule out.
- An installed Home Screen app sign-in check.
- One production account has both a password and a Google link. It predates the linking fix and may merit a look.
- `api-flowledger-dev.razs.dev` stays outside Access. The claude.ai MCP connector calls it server to server, and the dev SPA makes cross-origin requests to it, so it relies on the API's own JWT/OAuth auth.
- Once a PR check workflow exists, add it as a required check on `main`.

**Suggested fix:** Run the owner CSP checks above. Review the access logs. Add a PR check workflow, then require it.

---

## [OPEN] #047 — In-app navigation does not warn about unsaved Form View changes

**Found in:** Implementing `st005-reusable-editable-form-view`.

**Scope:** `apps/web/src/main.tsx` (`BrowserRouter`), `apps/web/src/hooks/useFormDraft.ts`, `apps/web/src/components/FormView.tsx`.

**Description:** A dirty draft is protected by a `beforeunload` guard and by a confirm on the view's own Discard and Back controls. Clicking a sidebar or other in-app link while dirty leaves the page and silently drops the edits, because React Router's `useBlocker` needs a data router and the app uses `BrowserRouter`.

**Suggested fix:** Move to `createBrowserRouter`/`RouterProvider`, then block navigation with `useBlocker` while `draft.isDirty` and reuse the Discard confirm dialog.

---

## [OPEN] #048 — Notification messages keep the sender label from send time

**Found in:** ST-003 review of identity privacy.

**Scope:** `apps/api/src/modules/notifications/`, every `createDedupedNotifications` caller that builds `message` with `userLabel`.

**Description:** A notification's `message` is written once with the sender's label at send time. If the sender later switches to `username_only`, their name stays visible in the notifications already sent.

**Suggested fix:** Store only `senderUserId` plus the message template, and render the label at read time from the sender's current public identity.

---

## [OPEN] #049 — Share invitations through `/v1` and MCP have only the global rate limits

**Found in:** ST-003 review of `/v1` and MCP parity.

**Scope:** `/v1` shared-expense routes and the MCP `create_shared_expense` tool.

**Description:** `create_shared_expense` can send share invitations to any user id with only the global API rate limits. Consent and blocking limit the impact, and nothing counts financially until the share is accepted, but a key can still spam invitations.

**Suggested fix:** Add a per-key invitation rate limit on invitation creation.
