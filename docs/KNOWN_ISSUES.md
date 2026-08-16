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
