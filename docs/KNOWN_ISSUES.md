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
