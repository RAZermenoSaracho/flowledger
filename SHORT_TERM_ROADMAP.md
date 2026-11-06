# FlowLedger Short-Term Roadmap

## Overview

This roadmap covers FlowLedger's next product steps: fix three backlog items, make records directly editable, show users a small set of trustworthy financial metrics, reduce imported-transaction clutter, add notification ingestion, and grow accounts from labels into real financial instruments (credit cards, holdings, crypto, investments).

It is separate from the long-term [`ROADMAP.md`](ROADMAP.md), which it does not replace or change. Milestones 11-15 there overlap ST-015 to ST-019, ST-021, and ST-022; each overlap is noted on the intent, and any conflict is settled during that intent's discovery.

Each intent is a planning record, not a specification. Work is delivered one pull request at a time, in the order set by [Implementation Batches / PR Execution Plan](#implementation-batches--pr-execution-plan). A future session takes the next batch, investigates it with `/opsx:explore`, gets approval, specifies it with `/opsx:propose`, and implements it with `/opsx:apply`.

Evidence was gathered on 2026-11-05 and refined on 2026-11-06, both at commit `007fccb`. Priorities are proposals and have not been formally approved. Odoo tasks #127, #128, and #129 live in the Backlog stage of project #56 ("Flowledger"), which is the source of truth for those three items.

## Engineering principles

- **Minimal implementation:** build the smallest maintainable thing that meets the requirement, with no speculative abstractions or dependencies.
- **Reuse before abstraction:** extract shared code only when a real second consumer exists.
- **Incremental delivery:** every intent is independently understandable, implementable, and verifiable.
- **Architecture consistency:** follow `CLAUDE.md`, `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`, and `docs/TESTING.md`.
- **Security and data correctness:** enforce user isolation, keep secrets and payloads out of logs, and never request wallet keys or bank credentials. Say so when a financial figure is partial or stale.
- **Efficient AI-agent orchestration:** Opus orchestrates, Sonnet investigates, and atomic work goes to Codex through `/codex:rescue` when that saves effort. `/ponytail:ponytail` challenges complexity.

## Pre-production data policy

FlowLedger is in early testing with a small group of trusted users, so clean, correct financial models take priority over compatibility with test records created under incorrect behavior.

- No complicated migration, backfill, or legacy compatibility layer is added merely to preserve incorrect test financial records.
- A clean reset of affected test financial data is an acceptable strategy for a breaking financial-model change.
- The relevant OpenSpec proposal documents any reset: affected tables, dependencies, and intended scope.
- A reset uses the smallest safe scope that leaves a coherent dataset; it does not assume all records must go.
- User accounts, authentication, credentials, configuration, and unrelated data are preserved unless separately authorized.
- **A destructive reset never runs automatically. The exact operation requires the product owner's explicit approval before execution.**

## Roadmap

| ID | Intent | Priority | Dependencies | Status | Odoo Reference |
|---|---|---|---|---|---|
| ST-001 | Correct transaction execution date and time | High | None | Planned | Task #129 |
| ST-002 | "Keep me logged in on this device" | High | None | Planned | Task #128 |
| ST-003 | Convert an existing transaction to shared | High | None | Planned | Task #127 |
| ST-004 | Neutral charcoal dark theme | Medium | None | Planned | None |
| ST-005 | Reusable Editable Form View Foundation | High | None | Planned | None |
| ST-006 | Account Form View | High | ST-005 | Planned | None |
| ST-007 | Transaction Form View | Medium | ST-005 | Planned | None |
| ST-008 | Personal Financial Metrics | Medium | None | Planned | None |
| ST-009 | Imported-transaction bulk delete and retention | Medium | None | Planned | None |
| ST-010 | Notification regex rules | Medium | ST-005 | Planned | None |
| ST-011 | Notification ingestion endpoint | Medium | ST-010 | Planned | None |
| ST-013 | Credit-card limit and available credit | Medium | ST-006 | Planned | None |
| ST-014 | Credit-card statements, payment tracking, and reminders | Medium | ST-013, ST-007, ST-023 | Planned | None |
| ST-015 | Manual holdings and valuations | Medium | ST-006, ST-008, ST-023 | Planned | None |
| ST-016 | Automatic crypto holding prices | Medium | ST-015 | Planned | None |
| ST-017 | Stock and ETF market data | Low | ST-021 | Planned | None |
| ST-018 | Binance read-only account sync | Low | ST-015 | Planned | None |
| ST-019 | Read-only on-chain wallet sync | Low | ST-015 | Planned | None |
| ST-020 | User-configured external sync | Low | ST-015, ST-018 | Planned | None |
| ST-021 | Public securities catalog (stocks and ETFs) | Medium | ST-015 | Planned | None |
| ST-022 | Custom and non-public assets | Medium | ST-015 | Planned | None |
| ST-023 | Multi-currency balance correctness | High | ST-001, ST-007 | Planned | None |

ST-012 (debit support) is retired and has no active row; see its note under the intent details. IDs are stable and are not reused or renumbered, so numeric order is not execution order.

## Intent details

### ST-001: Correct transaction execution date and time

**Objective:** `Transaction.date` is a UTC execution instant everywhere. Users enter, see, filter, group, and report on it in their client's timezone, with DST handled correctly.

**Scope:** Replace the date-only create and edit fields with one native date-and-time field. Convert calendar filters to UTC instants at local-day boundaries, using half-open intervals, and bucket monthly reports and grouping by client timezone. There is no schema change and no compatibility layer for older test records, and no data is changed. Timestamps that aren't transaction dates keep their existing display.

**Acceptance criteria:**
- Users can change the date, the time, or both in one field. Changing one keeps the other, and editing unrelated fields leaves the stored timestamp unchanged.
- List, detail, edit, and group views show date and time in the client's timezone.
- Calendar filters, month grouping, and monthly reports place a transaction on its client-local day and month, in positive and negative offsets and across DST changes.
- API and MCP date-only requests stay valid and mean `00:00:00 UTC`, and offset datetimes normalize to UTC.
- A provider date with no known time shows no invented time, and the limitation is documented.
- Older records stay unchanged and are read as the UTC instants they hold.

**Dependencies:** None. ST-023 builds on the UTC execution instant.

**Relevant existing architecture:** `Transaction.date` is a `TIMESTAMP(3)` column. Form input has been stored at UTC midnight, while settlement approval stores real times. All 156 local imported rows carry Syncfy dates at exactly UTC noon, with no execution time in any other provider field. Filters and report month buckets currently use UTC days. See the OpenSpec change `fix-transaction-date-display` for the full design.

**Odoo reference:** Task #129.

### ST-002: "Keep me logged in on this device"

**Objective:** Users on a trusted device stop being asked to log in repeatedly, and they can choose whether a session persists.

**Scope:** Find out why sessions end today, add the login option, and revoke sessions on password change. The code already provides much of what the task asks for, so this is smaller than a new session system.

**Acceptance criteria:**
- With the option enabled, closing and reopening the app on mobile and desktop keeps the session for the defined period.
- With the option disabled, the session ends according to the rule chosen in discovery.
- Logout invalidates the persistent session on that device.
- Changing a password revokes the user's other sessions.
- Covered by tests.

**Dependencies:** None.

**Relevant existing architecture:** Access JWTs last 15 minutes and are held only in memory. Refresh tokens last 30 days, are hashed, rotate on each use, and travel in an `HttpOnly`, `SameSite=Strict`, `Path=/auth` cookie, so renewal already slides. The web app refreshes silently on boot and on 401. Logout already revokes. Missing: a login option, and revocation on password change (`users/services/update.service.ts`). Reuse detection and login rate limiting are tracked separately as `docs/KNOWN_ISSUES.md` #007.

**Open questions:**
- Why do users get logged out on mobile despite the 30-day token? Unverified candidates: a rotated token whose response was lost (for example, when the app resumes on a bad network), concurrent refreshes across tabs, cookie handling when launched from the home screen, and the cookie domain configuration.
- The task says that without the option "the session expires as it does today", but today's behavior is already a persistent 30-day session. Should unchecked mean a browser-session cookie, a shorter period, or something else?
- Should sensitive actions require re-authentication? The task asks for this to be evaluated.
- `CLAUDE.md` still says "No session cookies" and gives a `7d` JWT default, which no longer matches the code. `docs/AUTH_FLOW.md` is accurate. Correct this as part of the intent.

**Odoo reference:** Task #128.

### ST-003: Convert an existing transaction to shared

**Objective:** A user can make an existing transaction shared from its edit view, on mobile and desktop.

**Scope:** Add the sharing controls to the edit experience using what the create form already has. The backend path already exists, so a backend change is not expected.

**Acceptance criteria:**
- From the edit view on mobile, a user can convert an existing transaction to shared and save.
- The same flow works on desktop.
- The transaction then appears as shared in the list and in the relevant balances and debts.
- Transfers still cannot be shared, and shares cannot exceed the amount.
- Participants receive the usual notifications.
- Covered by tests.

**Dependencies:** None. Doing this before ST-007 means ST-007 only has to preserve it.

**Relevant existing architecture:** The control is missing on desktop too, not only on mobile. `TransactionEditPage.tsx` has its own form without `SharedParticipantsFields.tsx`. `updateTransactionSchema` omits `sharedExpense`, but `POST /shared-expenses` already accepts an existing transaction and the web client already uses it. Sharing is a `SharedExpense` with participants; debts derive from those participants.

**Open questions:**
- `docs/KNOWN_ISSUES.md` #017 (amount edits do not rescale shares) and #019 (non-group transactions accept any user id as a participant) become easier to hit with this flow. Should either be fixed here?

**Odoo reference:** Task #127.

### ST-004: Neutral charcoal dark theme

**Objective:** Dark mode looks charcoal or graphite instead of dark blue, in the spirit of VS Code's dark themes.

**Scope:** Change the dark palette centrally, without component-by-component overrides. Keep the existing brand colors and visual identity. Light mode must not change.

**Acceptance criteria:**
- Dark-mode surfaces, borders, and hover states show no dominant blue tint.
- Text meets WCAG AA contrast, and page, card, and raised surfaces stay visually distinct.
- Chart tooltips and axes, and native select popups, are readable in dark mode.
- Light mode looks the same as before.

**Dependencies:** None.

**Relevant existing architecture:** The tint comes from Tailwind's default `slate` scale (`dark:bg-slate-*` 70 uses, `dark:border-slate-*` 74, `dark:text-slate-*` 233, `dark:hover:bg-slate-*` 40), plus a hardcoded `#020617` in `index.css`. `tailwind.config.ts` defines only four brand colors and there are no CSS variables. Dark mode is class-based (`hooks/useTheme.tsx`). Light mode also uses `bg-slate-*` 188 times, so simply overriding `slate` in the theme would change it. Charts use hardcoded hex fills and default Recharts tooltip and axis styling.

**Open questions:**
- Can one central mechanism change `slate` only under `.dark` (for example, slate steps backed by CSS variables), avoiding a sweep?
- Which `text-slate-400` and `text-slate-500` labels need adjusting on the new surfaces?

### ST-005: Reusable Editable Form View Foundation

**Objective:** FlowLedger has one reusable, Odoo-inspired form view, so models reuse the entire editing experience and not merely individual inputs. Users open a record, click or tap a value to edit it, and need no global Edit button.

**Scope:** Extract the common experience from Profile into a model-agnostic foundation, and migrate Profile onto it within this intent as its first real consumer. Accounts and Transactions adopt it separately (ST-006, ST-007).

| Shared Form View owns | Each model view owns |
|---|---|
| Form structure, sections, and tabs | Data fetching and API mutations |
| Editable-field wrapper, activation, and focus | Authorization |
| Display and editing states, draft values, and dirty state | Business validation |
| Save/Cancel UI and one batch-save lifecycle | Field dependencies |
| Validation, loading, saving, and persistence-error presentation | Model-specific actions and specialized sections |
| Unsaved-change protection and responsive layout | Specialized financial calculations |
| Composition of custom field types | Custom field renderers |

Direct editing does not mean persisting each field on change: edits accumulate in a draft and save together, so coupled fields stay atomic. Each model supplies its own save function behind that one lifecycle.

**Not built here:** a schema-driven form engine, field-definition DSL, plugin registry, ORM abstraction, global form-state framework, or second data-fetching layer. The shared code contains no model conditions such as `if (model === 'transaction')`; it uses composition, typed props, and small focused hooks.

**Acceptance criteria:**
- Profile runs on the shared Form View, its own copy of the common lifecycle is gone, and its existing behavior and UX are unchanged, including tab switching that keeps the draft and avatar upload on save.
- A non-Profile test consumer gets the full lifecycle (draft, dirty state, Save/Cancel, validation, saving, and persistence errors) by supplying only its fields, initial values, validation, and save function.
- The shared code contains no reference to any specific model.
- Fields support click, tap, and keyboard activation, including Escape to revert, with read-only fields staying non-editable.
- Text, select, textarea, and custom fields are supported, with field-level validation shown next to the field.
- Loading, saving, and persistence-error states display consistently.
- Unsaved changes are protected according to the rule set in discovery.
- The form remains usable at mobile width, without iOS focus zoom.

**Dependencies:** None.

**Relevant existing architecture:** Draft state is hand-written in three places (`useProfileDetails.ts`, `useAccountEditForm.ts`, `TransactionEditPage.tsx`), but only Profile has click-to-edit, dirty tracking, a persistence-error display, and an unload guard. `ProfileInlineField.tsx` has no Profile imports but only finds `input` and `select`. `ProfileTabs.tsx` has an accessible, URL-driven tablist but is hardcoded to Profile's tabs. Generic parts of `useProfileDetails.ts` are the draft diff, cancel, saving and error state, the guard, and validation gating of save. Profile-specific parts are name and email rules, avatar preview, display helpers, and the two-step save. The avatar file also counts as dirty, so the lifecycle needs custom save functions and an additional dirty source. Preferences, Security, and Subscription tabs use their own mutations and can stay independent. `ProfileHeader.test.tsx`, `ProfilePage.test.tsx`, and `ProfileInlineField.test.tsx` pin current behavior, which makes this migration a safe proof of no UX change. The web app uses TanStack Query and has no form library. Keep single selects native, per `openspec/specs/select-dropdowns`.

**Profile adoption decision:** Include Profile in this intent. An estimated 8-10 files change, it is the only reference implementation, and its existing tests prove reuse. A separate intent would leave a foundation with no consumer and two implementations in the meantime.

**Open questions:**
- Only `beforeunload` exists today. In-app navigation blocking is new: React Router's `useBlocker` needs a data router, and `main.tsx` uses `BrowserRouter`. Is `beforeunload` enough for the first version, or is a router migration justified?

**Adoption rule for current and future models:** Any independently editable record uses this foundation, including accounts of every type, transactions, regex configurations, securities, custom assets, and holdings that warrant their own record view. Later intents add fields and sections as model-owned composition, and none may introduce a separate form lifecycle. The foundation grows only when one of those consumers needs it.

### ST-006: Account Form View

**Objective:** Clicking an account opens a dedicated form view on the shared foundation, where its details can be edited directly and its actions are available.

**Scope:** Add an account route and view composed from ST-005. Account-specific fields, validation, actions, and sections stay in the account domain. Show type-specific fields only where a real difference exists today. Move or link existing actions (sync, archive, delete). Later intents add sections for credit cards, crypto portfolios, and investment portfolios to this view, all under one form lifecycle.

**Acceptance criteria:**
- Clicking an account opens its own view at a linkable URL, and only the owner can reach it.
- Fields can be edited directly and validated through the shared Form View, with no account-specific copy of its lifecycle.
- Sync status and archive/delete actions remain available for the account.
- The view works at mobile width.
- Not every account type is forced to show identical fields, and a type can add a section without touching the shared foundation.
- Account type labels make clear that `checking` covers debit and everyday bank accounts.

**Dependencies:** ST-005.

**Relevant existing architecture:** `AccountsPage.tsx` is the only account route. Clicking a row expands it (`AccountListItem.tsx`), and Edit swaps in an inline form (`useAccountEditForm.ts`) for name, type, identifier, currency, and initial balance. There is no type-specific logic. The UI shows the raw enum as the type label.

**Open questions:**
- Should editing be restricted for synced accounts? The UI shows only a badge today.
- What happens to the inline row form and row expansion once this view exists?

### ST-007: Transaction Form View

**Objective:** The transaction detail view becomes directly editable on the shared foundation, with no separate Edit button or edit mode for normal field changes.

**Scope:** Move the transaction view onto ST-005, keeping all current behavior. Coupled-field rules and business validation stay in the transaction domain, and all fields save as one batch. The view can also open a new, unsaved draft from initial values, which ST-014 needs. There is no transaction-specific form lifecycle.

**Acceptance criteria:**
- Fields can be edited directly from the transaction view without entering a separate edit mode.
- All current validation and business rules still hold, including the field couplings below and the ST-003 sharing flow if delivered.
- A transaction cannot be saved in an invalid in-between state, such as a transfer without a destination.
- Saving other fields doesn't overwrite a stored execution time.
- Existing `/transactions/:id/edit` links keep working.
- A new transaction draft with prefilled values opens at its own URL and creates nothing until the user saves.
- The view works at mobile width.

**Dependencies:** ST-005. Sequence after ST-003.

**Delivery:** Two batches. B-009 makes existing transactions directly editable. B-013 adds prefilled new drafts just before ST-014 uses them.

**Relevant existing architecture:** `/transactions/:id` is read-only with an Edit button, and `/transactions/:id/edit` is a separate form linked from `TransactionsPage.tsx` and `TransactionDetailPage.tsx`. `TransactionEditPage.tsx` (362 lines) re-implements fields that the create form shares through `TransactionCoreFields`, so the two can drift. Coupled fields: choosing an account changes the currency; choosing transfer clears category, group, and sharing and requires a different destination; changing group resets the category and forces sharing. These rules are repeated in inline handlers today. Pure functions owned by the Transactions page could serve both create and edit while the foundation stays free of them. Creation currently happens only inline on the list page, and no prefill mechanism exists.

**Open questions:**
- Should the inline create form on the list page remain, or move to the same view as new drafts?

### ST-008: Personal Financial Metrics

**Objective:** The Profile General tab gives users an honest overview of their financial position and recent savings, using only data FlowLedger already has.

**Scope:** A compact, read-only "Financial overview" section with two metrics, backed by one read endpoint. There is no migration, new classification, or user configuration. The metrics are computed information, so they compose into Profile without using the editable-field parts of ST-005.

**Selected metrics:**

| Metric | Definition | Shown as |
|---|---|---|
| **Estimated net worth** (*Patrimonio neto estimado*) | Active account balances, plus what people owe the user, minus what the user owes people, all converted to the preferred currency | The total and its three components, labeled as an estimate based on recorded balances |
| **Savings rate** (*Tasa de ahorro mensual*) | (Net income − net expenses) ÷ net income × 100, for the last complete calendar month | A percentage with the month named, labeled as based on recorded transactions |

**How savings-rate inputs are treated:**
- "Net income" means FlowLedger's existing report value, which excludes reimbursement offsets. It does not mean after-tax income.
- Transfers are excluded, so moving money into savings or investments is not spending, and a card payment recorded as a transfer doesn't count twice.
- Card purchases count on their purchase date.
- Shared expenses count at the full amount until settled. A settlement with an offset category then reduces net expenses in the month it is approved, which can understate savings in the earlier month.
- Reimbursements recorded with an offset category reduce expenses. FlowLedger has no separate refund type, so a refund recorded as plain income counts as income.
- A card payment recorded as an expense counts twice, and FlowLedger can't detect this, so the label says the figure depends on how transactions were recorded.
- Pending imported transactions don't count until they are reviewed.

**Candidate decisions:**

| Metric | User value | Required inputs and availability | Complexity | Main correctness risk | Prerequisites, migration, configuration | Related intents | Disposition |
|---|---|---|---|---|---|---|---|
| Net worth | High | Balances, debts, and rates all exist | Low | Cross-currency distortion and assets recorded below market value; disclosed | None | ST-023, ST-014, and ST-015 refine it | **Include now** |
| Savings rate | High | Monthly cashflow exists, with transfers excluded | Low | Depends on complete, correctly typed records | None | None | **Include now** |
| Emergency fund coverage | High | No marker for liquid accounts, a designated fund, or essential expenses | Medium | Treating all balances as emergency savings and all spending as essential | Needs account designation and essential-expense classification, with migration and user configuration | No current intent provides this | **Include later** |
| Debt-to-income ratio | Medium | No gross income, loan model, interest, or principal; only transfers into cards can be identified | High | Card payments alone are not debt service, and net income is not gross income | New income and loan data, plus user configuration | ST-014 identifies only card payments | **Exclude** |
| Personal inflation | Low | No recurring detection, quantity, or unit price; categories can be renamed | High | Calling spending growth inflation | Needs a stable basket, plus migration and configuration | None | **Exclude** |
| Fixed vs variable expenses | Medium | No recurring or fixed marker on categories or transactions | Medium | One category can mix both kinds | Needs a user-controlled classification, with migration and configuration | Could share a classification with emergency fund coverage | **Include later** |
| Investment returns | High | No contributions, cost basis, valuation history, dividends, or fees | High | Comparing current to initial balance treats deposits as gains | ST-015, plus cost-basis data no current intent adds | ST-015, ST-021, ST-022 | **Include later** |

None of the deferred metrics gets its own intent yet. Each one needs new data and a product decision first, and should become an intent only when that need is confirmed.

**Acceptance criteria:**
- The General tab shows both metrics at mobile width and in light and dark themes, with units, the time period, and the "estimate" or "recorded" label visible.
- Credit-card debt reduces net worth, and an overpaid card increases it.
- A same-currency transfer between a user's accounts changes neither metric.
- Settling a debt leaves net worth unchanged, apart from exchange-rate differences.
- Archived accounts are excluded, and the section says so when an excluded account has a non-zero balance.
- Net worth names any account or debt left out because a rate is missing, and shows as partial instead of failing.
- A missing rate for the savings rate shows that metric as unavailable. It affects neither net worth nor the rest of Profile.
- Zero or negative income shows the savings rate as unavailable, not as zero or infinity. Expenses above income show a negative rate.
- A month with no income or expense transactions shows "not enough data".
- The last complete month follows the user's local calendar, not the server's.
- Past-month amounts in other currencies are disclosed as converted at current rates.
- Net worth discloses when it is affected by cross-currency transfers, or by transactions in a currency other than their account's.
- If the user has `investment` accounts, net worth discloses that they count at recorded balance, not market value.
- If the user has synced accounts, net worth discloses that their balances come from recorded transactions and may differ from the bank.
- Disclosures appear only when they apply, grouped in one place so the section stays compact.
- Users without a preferred currency get the same USD fallback as reports, and the currency is shown.
- Only the user's own data is included, and all calculation happens in the API.

**Dependencies:** None. It is sequenced after ST-005 so the General tab changes once.

**Relevant existing architecture:** Net worth is not computed anywhere, and the dashboard's "Current balance" is income minus expenses, not a sum of accounts. Balances are signed (`initialBalance + income - expense - transfers out + transfers in`), so card debt is already negative and no asset/liability classification is needed. A new `GET /reports/financial-overview`, in the read-only `reports` module, can reuse `withAccountBalances`, `getExchangeRate`, `listDebts`, and `calculateMonthlyCashflow`. `listAccounts`, `listDebts`, and the cashflow report each convert under one `Promise.all`, so one failed rate fails the whole call; the metrics need per-item handling without changing those endpoints. `listAccounts` doesn't exclude archived accounts by default. Rates are live with no stored history, and reports already convert past months at today's rate (`docs/DOMAIN_LOGIC.md`). Reports ignore the `exchangeRate` and `amountInPreferredCurrency` snapshots on `Transaction`, which aren't recomputed when the preferred currency changes. ST-001 makes report months follow the client's timezone. On the web, `GeneralTab.tsx` is a small definition list, `Card` is reusable, and `DashboardPage.tsx` has a private `Metric` component that could be lifted out. A self-contained component with its own query stays independent of `useProfileDetails`, so a metrics error can't affect editing.

**Progressive enhancement:**
- ST-023 corrects cross-currency balances and removes the related disclosure once affected test data follows the pre-production data policy. Exchange-rate movement can still change net worth, because it is a current valuation, but never an account's native balance.
- ST-014 decides how declared card payments affect net worth.
- ST-015 adds holdings to this same calculation (B-019) and removes the `investment` disclosure for accounts with holdings. It must not introduce a second net-worth calculation.
- Investment returns stay deferred on ST-015. Emergency fund coverage and fixed vs variable expenses wait for a confirmed need for the classification they share.

**Open questions:**
- A creditor with a shared expense that has no account gets a receivable, but no balance ever fell, so net worth overstates. Should those receivables be left out?
- Should debts with manual participants count? The default is yes, since they are real amounts owed.
- Should archived accounts with money in them count? The default is no, with the disclosure above.
- Is one month too noisy? The default follows the requested monthly definition. A three-complete-month average costs the same if real data proves noisy.
- Does existing test data make the metrics misleading, such as card payments recorded as expenses? The pre-production data policy applies; ST-008 adds no special handling to compensate for those records.

### ST-009: Imported-transaction bulk delete and retention

**Objective:** Users can clear imported-transaction clutter, and non-imported records stay within a per-user limit of 100.

**Scope:** Add bulk delete to the existing review UI and enforce oldest-first retention within existing write paths, without new background infrastructure. Exact lifecycle semantics are settled during specification.

**Acceptance criteria:**
- A user can select imported records and delete them in bulk, including across a filtered selection.
- Exceeding the limit removes that user's oldest eligible records first, in a deterministic order.
- Records linked to a real transaction, and those transactions themselves, are never deleted.
- One user's actions never affect another user's records.
- A deleted record does not silently return on the next sync, or the agreed exception is documented.
- Covered by tests, including limit boundaries and re-sync.

**Dependencies:** None.

**Relevant existing architecture:** `ProviderImportedTransaction.status` is a free string, with typed values `pending`, `processed`, and `ignored`; Syncfy code also uses transient `imported` and `failed`. Batch import, ignore, and unignore exist, and `TransactionsPage.tsx` already has multi-select and select-all-filtered. No delete endpoint was found. `userId` is nullable, and `transactionId` becomes null when the linked transaction is deleted.

**Open questions:**
- **Resurrection:** re-sync inserts rows and skips only on the `(provider, providerTransactionId)` unique key, so a deleted row returns as `pending`. Which approach is smallest: a tombstone, a sync cutoff date, or something else? This also decides whether a "deleted" row still counts toward the limit.
- Should still-pending rows share the policy with ignored ones? Auto-deleting unreviewed rows could lose transactions the user never saw.
- Is the limit 100 combined or per status? Are `processed` rows with a null link eligible?
- Should `failed` rows count?

### ST-010: Notification regex rules

**Objective:** A user can define, test, and activate rules that extract transaction data from notification text.

**Scope:** User-owned rule configuration in a form view built on ST-005, with field patterns, activation validation, a test against sample text, and safe regex evaluation. Extraction fields, pattern testing, activation requirements, and validation are regex-domain code; the shared foundation provides the editing experience. The endpoint itself is ST-011. This is inbound notification ingestion only, not a general integration platform.

**Acceptance criteria:**
- A user can create, edit, activate, and deactivate their own rules; no other user can see or use them.
- A rule cannot be activated until every mandatory field has a valid extraction rule (or an agreed default).
- Optional fields may be left unconfigured.
- Testing against sample text shows what each pattern extracts, without creating anything.
- Pathological patterns and oversized input cannot stall the API.
- The configuration form uses the shared Form View, with no separate form lifecycle, and works at mobile width.

**Dependencies:** ST-005.

**Relevant existing architecture:** `Transaction` requires `name`, `amount`, `type`, and `date`. Currency falls back to the account's, then the user's preferred currency; `accountId` and `categoryId` are optional. No regex runs on user input today, and there is no RE2 dependency, worker, or timeout code.

**Open questions:**
- **Feasibility gate, settle first:** research found no iOS Shortcuts trigger that reads another app's notifications, so **the intended iPhone workflow may be impossible for bank push notifications**. The available triggers appear to be SMS/iMessage, Mail, and a Wallet transaction trigger that covers card taps only. Android can read notifications through Tasker-style apps with user-granted access; Android 15 reportedly restricts OTP notifications. These findings come mostly from secondary sources, so verify on real devices. If the user's banks do not send SMS or email, this intent's value on iPhone changes significantly.
- Which fields must be extracted, and which may have a rule-level default? For example, `type` could be fixed per rule and `date` could be the time received.
- How should safe evaluation work: RE2 (a new native dependency) or a worker with a timeout, plus pattern and input limits?
- How does a rule choose its account?

### ST-011: Notification ingestion endpoint

**Objective:** An automation can send notification text to FlowLedger with a dedicated credential and get a reviewable record.

**Scope:** Authenticated inbound endpoint, restricted credential, input and rate limits, duplicate protection, the pending/incomplete record flow, and visible setup details. Incomplete extractions land in review instead of failing silently.

**Acceptance criteria:**
- A user can see their endpoint and create and revoke a credential that can do nothing except ingest. The secret is shown only once.
- Valid text produces a reviewable record, or a transaction if that behavior is chosen in discovery.
- Missing optional data produces a pending record that the user can complete.
- Sending the same notification again creates no duplicate.
- Malformed or oversized payloads, and requests over the rate limit, are rejected safely.
- One user's key can never create or reveal another user's data, including through dedupe collisions.
- Notification text and credentials never appear in application logs.

**Dependencies:** ST-010.

**Relevant existing architecture:** Reuse the `ApiKey` system (hashed `fl_` keys with expiry, revocation, and last-used tracking, managed in `Profile/components/ApiKeysSection.tsx`). Scopes are only `read` and `write`, so an ingest-only scope is new. `utils/rateLimit.ts` can be reused. `express.json` applies a global 1 MB limit in `app.ts` before routes, so a smaller limit needs route ordering attention. morgan logs URLs, so keys belong in headers only. `ProviderImportedTransaction` fits as staging and already has a review flow, MCP tools, and `/v1` endpoints.

**Open questions:**
- Staging fit: `providerCredentialId` and `providerAccountId` are required strings, so would synthetic values be acceptable? `FinancialProviderAdapter` is shaped for outbound sync. Is using the staging table without the adapter compatible with the rule against parallel provider systems?
- Dedupe keys: the unique key is global, not per user, so ingestion keys must be namespaced per user. Should the key be client-supplied or a text hash? Could legitimate identical purchases collide?
- `rawData` would store notification text in the database. How long should it be kept, and should it be stored in full?
- Do these rows count toward the ST-009 limit?

### ST-012: Debit support (retired)

**Not an active intent.** The existing `checking` type already represents a traditional debit or bank account, so no `debit` account type is needed. `Account.type` changes no behavior in balances, transactions, or transfers, so checking accounts already receive, hold, spend, and transfer money, and synced accounts already use them.

Two small gaps remain, and neither justifies its own intent:
- The UI shows the raw label "checking", which ST-006 clarifies.
- Syncfy type inference checks `card` and `tarjeta` first, so a "debit card" or "tarjeta de débito" account becomes `credit_card`. ST-013 fixes this, since credit-card features would otherwise apply to debit accounts.

### ST-013: Credit-card limit and available credit

**Objective:** Credit-card accounts show the limit, outstanding balance, and available credit.

**Scope:** Add a credit limit to credit-card accounts and derive the rest, as a section of the account form view. Correct debit-card misclassification (see ST-012). Billing cycles and payment tracking are ST-014.

**Acceptance criteria:**
- A user can set and edit a limit on credit-card accounts only.
- Outstanding balance and available credit are derived from existing balances and match recorded transactions.
- Available credit goes negative when the limit is exceeded, and this is visually clear.
- An overpaid card is displayed sensibly.
- Cards without a limit, including all existing ones, keep working.
- A newly synced account named as a debit card is not classified as a credit card, and the treatment of accounts already misclassified is decided.

**Dependencies:** ST-006.

**Relevant existing architecture:** `Account` has no limit, statement, or due-date fields. Card debt is a negative derived balance. A payment recorded as a transfer from checking raises the card balance toward zero correctly. `normalizeAccountType` in `providerAccountMetadata.ts` holds the inference order.

### ST-014: Credit-card statements, payment tracking, and reminders

**Objective:** Users can track each statement's dates, amount, and payments, with or without recording a transaction, and get reminded before payment is due, while balances stay financially coherent.

**Scope:** Billing cycles or statements, payment tracking, the payment interaction below, optional transaction creation, highlighting of outstanding payments, and in-app reminders. The accounting mechanism is chosen during this intent's discovery.

**Payment interaction:**
1. The user marks a statement as partially or fully paid.
2. Partially paid asks for the amount. Fully paid uses the remaining statement amount, subject to confirmation.
3. A modal asks whether to also record the payment as a transaction.
4. **Record a transaction:** the app opens a prefilled transaction draft in the Transaction Form View. Nothing is created until the user saves, and the user has a way back to the card.
5. **Do not record a transaction:** the payment stays in statement tracking, with the amount paid and remaining amount preserved and the status updated. No standard transaction is forced.

The modal offers clear partial and full options, an amount input when appropriate, and clear feedback about payment status and account balance. Its visual design belongs to implementation planning, using `/ui-ux-pro-max` and `/ui-styling`.

**Important invariant:** Payment tracking and transaction creation are separate user actions, but financial balance changes must have one authoritative accounting representation. If the user later creates a transaction corresponding to a previously declared payment, the payment must not apply twice.

**Acceptance criteria:**
- Each statement shows its amount, amount paid, remaining amount, and status (unpaid, partially paid, or fully paid), distinct from the current card balance and available credit.
- A user can pay partially or fully, and can choose whether to record a transaction, including declining.
- Opening the prefilled draft creates nothing until the user saves it.
- Payment history is preserved, including multiple partial payments on one statement.
- Marking a statement as paid never resets the whole card balance, and it is never treated as an ordinary expense.
- Every balance change from a payment can be traced to one auditable record, without a second balance system.
- Recording a transaction for a previously declared payment does not reduce the balance a second time.
- A scenario test covers: limit $30,000, statement $10,000, $2,000 of purchases after closing, and current debt $12,000. Declaring a $6,000 payment gives paid $6,000, remaining $4,000, status partially paid, and a current debt that reflects the payment exactly once, including after the matching transaction is later recorded.
- The next cycle starts unpaid; paid status does not persist as a permanent account flag.
- Outstanding and overdue payments are highlighted.
- A reminder arrives once per statement, even after restarts and repeated scheduler runs.

**Dependencies:** ST-013, ST-007 for prefilled transaction drafts, and ST-023, since a card payment can cross currencies.

**Delivery:** Three batches. B-012 adds statements and status, B-014 adds payments and their accounting, and B-015 adds reminders. The accounting mechanism is settled before B-012, because it shapes statement storage.

**Relevant existing architecture:** No statement, billing, or due-date concept exists. Transfers from checking to a card are the only existing path correct for both accounts, and reports exclude transfers from income and expense. `Transaction.accountId` is nullable in the schema, but the API requires both sides of a transfer. `ProviderImportedTransaction.transactionId` and `SharedExpense.transactionId` show a nullable unique link pattern. Notifications are in-app only (`Notification` with a `NotificationType` enum, so a new type needs a migration); there is no email or push, and per-statement deduplication would be new. The only background job is `SyncfyAutoSyncScheduler`, a `setInterval` in the API process with an in-memory overlap guard, so it is not safe across multiple instances.

**Open questions:**
- **What is the authoritative accounting mechanism for a payment declared without a transaction?** Candidates to investigate:

| Candidate | Current debt in the $6,000 scenario | Later matching transaction |
|---|---|---|
| Transfer with no source account | Correct, one row | Must update that same row, and needs the validator relaxed |
| Payment record carrying the amount, optionally linked to a transaction | Correct; the calculation gains one input | Effect must count only while unlinked, or the transfer's card side is ignored |
| Income on the card | Correct, but inflates income reports | Double-counts unless reconciled |
| Editing `initialBalance` | Correct, but rewrites history with no record | Double-counts |

  The last two conflict with the requirements above and are listed so they aren't revisited.
- **Should a declared payment name a source account?** Without one, card debt falls by $6,000 while no other account falls, so net worth (ST-008) rises by $6,000 until the matching transaction is recorded. Should this be allowed, disclosed, or avoided by asking for a source?
- How are declared payments matched to later transactions: an explicit user link, a suggestion, or both? This includes Syncfy-imported payments, which can arrive after a declared payment.
- If the user opens the draft and abandons it, is the payment still declared? Does it take effect when declared, or when the transaction is saved?
- What happens if a linked transaction is edited to a different amount or deleted? Today's link pattern nulls the link on delete.
- How are payments above the remaining statement amount handled? How are declared payments corrected or reversed?
- Which transaction type should the prefilled draft default to? Existing semantics favor a transfer from another account, not an expense, but this is confirmed in discovery.
- Should status attach to a stored statement or be computed per cycle? A per-cycle record is the leading option, since a permanent boolean would be wrong the next month.
- Is the statement amount entered by the user or derived from transactions in the cycle?
- Are in-app reminders enough for a user who doesn't open the app? If not, email or push is a separate decision.
- How are short months and closing dates on non-business days handled?
- Do existing test records conflict with the chosen accounting mechanism, such as past card payments recorded as expenses? If so, the proposal applies the pre-production data policy, with no compatibility layer for them.

### ST-015: Manual holdings and valuations

**Objective:** Crypto and investment accounts can hold multiple manually maintained positions, with an aggregate value that counts toward net worth.

**Scope:** The holding/position capability: which account holds how much of which instrument, with manual quantity and valuation updates, valuation source and timestamp, manual override, stale-value handling, currency conversion, aggregate account value, and net-worth integration. A holdings section joins the account form view. This intent decides how a holding references its instrument, and manually maintained crypto portfolios are its first complete use, since they can reuse existing currency codes. Securities are ST-021 and custom assets are ST-022. No automated sync is included.

**Acceptance criteria:**
- A user can add, edit, and remove multiple holdings on an eligible account, and only the owner can access them.
- The same instrument can be held independently in different accounts, with separate quantities.
- Each holding shows quantity, unit value, total value, currency, valuation time, and source.
- Quantity and valuation can be updated manually, and a manual override is labeled as such.
- The account shows an aggregate value, and the ST-008 net-worth calculation includes it without double counting.
- Holdings with stale or missing valuations are clearly marked.
- Existing investment accounts keep their current balance behavior until the user adds holdings, or follow an agreed migration.
- Holdings editing uses the shared Form View conventions, with no separate form lifecycle.

**Dependencies:** ST-006, ST-008 for net-worth integration, and ST-023 so crypto quantities use its exact precision.

**Delivery:** Two batches. B-018 adds holdings and manual valuations, and B-019 adds aggregate value and net-worth integration.

**Future metric:** Investment returns (ST-008) become possible only with holdings plus contributions, withdrawals, cost basis, and valuation history. This intent doesn't add those, and an account's current balance compared with its initial balance is not a return.

**Relevant existing architecture:** No holding, position, or asset model exists, and `investment` is only a label. Prisma has no currency model: currencies are plain strings, and crypto codes come live from Binance symbols, with no names, chain, or contract identity and no persistence. A crypto holding could reference a code and reuse `getExchangeRate`, at the cost of not distinguishing the same symbol on different chains or tokens Binance doesn't list. `ROADMAP.md` Milestone 12 proposes `crypto_balances` plus a `currencies` table (which conflicts with today's string model), Milestone 13 covers aggregate display, and Milestone 15 covers investments.

**Open questions:**
- **How does a holdings value relate to the balance derived from transactions?** Does an account's value equal holdings, or holdings plus cash? This is the main double-counting risk.
- **Which concepts truly need independent persistence?** The current hypothesis is at most two: a holding and an instrument definition, with `kind` distinguishing security, crypto, and custom. This avoids separate catalogs and nullable reference pairs, but it must be tested against fields that apply to only one kind. Unit value, total value, and valuation source may not need separate models.
- Should crypto reuse currency codes, share the instrument record, or have its own catalog? Existing metadata should not be duplicated without need.
- Does each holding need its own page, or is inline editing in the account view enough? Start from inline unless a holding has enough detail to justify navigation.
- Is a manual unit value compatible with Milestone 14 ("exchange rates never stored")? It is arguably an asset valuation rather than an exchange rate, but that should be stated deliberately.
- Are performance and cost-basis tracking needed now? They are not required here, and Milestone 15 lists performance reporting for later.
- If the chosen relationship between holdings and balance conflicts with existing test investment accounts, the proposal can apply the pre-production data policy instead of an elaborate migration.

### ST-016: Automatic crypto holding prices

**Objective:** Crypto holdings value themselves from existing price data unless the user overrides them.

**Scope:** Use the existing crypto pricing for supported assets, on the ST-015 holdings. Quantities stay manual here. Manual overrides always win until cleared.

**Acceptance criteria:**
- A supported crypto holding shows a market value and the time of its price.
- A manual override takes priority and is labeled as manual.
- An unsupported asset or unavailable price falls back to a manual or last-known value with a visible stale indicator, and never to zero.

**Dependencies:** ST-015.

**Relevant existing architecture:** `currencies/providers/binance/binance.client.ts` uses `api.binance.com` REST with a 60-second cache and bridges to fiat through USDT treated as USD. Pricing on read fits this, so no scheduler or new provider should be needed.

**Open questions:**
- Is a last-known price persisted? Prices are currently only cached in process, and Milestone 14 favors live lookups.
- Is the USDT-as-USD assumption accurate enough for displayed valuations?

### ST-017: Stock and ETF market data

**Objective:** Holdings of eligible securities can update their prices automatically from a suitable provider.

**Scope:** Market-data integration only: select one provider and add optional price updates for securities from the ST-021 catalog, with manual valuation remaining available. This intent adds no second stock model. Custom assets (ST-022) stay manual. Polling is the starting assumption; whether streaming is warranted is decided in discovery.

**Acceptance criteria:**
- A holding of a security the provider supports shows a price with its timestamp and source.
- A security the provider does not know keeps working with manual valuation.
- Delayed prices are labeled as such.
- Provider failure or a rate limit leaves the last value visible as stale, without breaking the account or net worth views.
- Manual overrides take priority.
- FlowLedger's calls stay within the provider's limits regardless of user count.

**Dependencies:** ST-021, which builds on ST-015.

**Relevant existing architecture:** FlowLedger cannot price stocks today. Providers belong under the domain's `providers/` folder, as with `currencies/providers/`. A `setInterval` scheduler pattern exists, with the single-instance caveat from ST-014.

**Open questions:** See "Market data" under deferred decisions. Licensing is the key question, since `ROADMAP.md` Milestone 20 anticipates a SaaS platform and free tiers often restrict commercial use.

### ST-018: Binance read-only account sync

**Objective:** A user can connect a Binance account with a read-only key so that holding quantities update automatically.

**Scope:** Per-user credential entry and revocation, quantity sync into the ST-015 holdings with no parallel holdings model, sync status, and manual overrides. This is about quantities; prices remain ST-016. Scheduled polling is the starting assumption, with FlowLedger always initiating the connection.

**Acceptance criteria:**
- A user connects with a read-only key, and a key with trading or withdrawal permission is rejected or clearly warned against, if that can be detected.
- Balances appear as holdings on the account and refresh by sync.
- Disconnecting removes the stored credential.
- The credential is encrypted at rest and never appears in responses or logs.
- Sync failures show as status and leave the last known quantities in place.

**Dependencies:** ST-015.

**Delivery:** Two batches. B-024 adds secure credential storage with connect and revoke, which ST-020 reuses. B-025 adds quantity sync.

**Relevant existing architecture:** `FinancialProviderAdapter` is the required pattern for account providers, and Milestone 11 expects it. It is a composition of optional capabilities, and `InstitutionCategory` already includes `exchange` and `wallet`, so a positions capability could be added without requiring transactions. **No per-user secret storage exists:** `ApiKey` hashes values, which won't work for a secret that must be read back, and no encryption code exists in `apps/api`. Current Binance use is public price REST only.

**Open questions:**
- How are secrets encrypted, and how is the key managed? This is the first secret of its kind in FlowLedger, so it needs a security review.
- Can the production host reach the Binance account API? Binance reportedly returns HTTP 451 for restricted regions and many cloud ranges, and US users need the separate binance.us API.

### ST-019: Read-only on-chain wallet sync

**Objective:** A user can track a wallet by its public address, with quantities read from the chain.

**Scope:** Read balances for a public address on a limited set of chains into the ST-015 holdings, kept distinct from exchange integrations. Seed phrases and private keys are never requested.

**Acceptance criteria:**
- A user can add a wallet with its public address, and no signature, seed phrase, or private key is requested.
- Native and supported token balances appear as holdings and refresh by sync.
- Unsupported chains and tokens are stated clearly, and users can add them manually.
- Sync failures leave the last known quantities in place with a visible status.

**Dependencies:** ST-015.

**Relevant existing architecture:** No wallet code exists. Binance pricing (ST-016) may cover many tokens, but not every on-chain asset. Milestone 12 anticipates wallet accounts.

**Open questions:**
- Is RainbowKit/MetaMask connection worth adding? Research indicates it only helps a browser obtain an address, so pasting an address may be enough at first and adds no dependency.
- JSON-RPC reads known tokens but cannot list what an address holds. Is a fixed token list enough, or is an indexer needed?
- Which chains come first? Non-EVM chains would each need separate work.

### ST-020: User-configured external sync

**Objective:** Advanced users can have FlowLedger pull quantities or prices from an external API they configure.

**Scope:** Outbound, FlowLedger-initiated sync from a user-configured endpoint into holdings. These are not inbound callbacks. Before starting, confirm the need remains after ST-016 to ST-019, since this is the riskiest intent and may turn out to be unnecessary.

**Acceptance criteria:**
- A user can configure, test, and remove an external source for a holding, with credentials stored securely.
- Requests to private, loopback, link-local, and metadata addresses are refused, including through DNS rebinding and redirects.
- Timeouts and response-size limits are enforced, and failures leave the last value in place with a visible status.
- The user can see what kind of data each source updates, and manual overrides still win.

**Dependencies:** ST-015, and ST-018 for credential storage.

**Relevant existing architecture:** There are no worker, queue, or persistent-connection facilities. The only background facility is an in-process `setInterval`. Outbound `fetch` calls today go only to fixed hosts, so this would be FlowLedger's first user-controlled outbound request.

**Open questions:**
- Is REST polling enough, and is WebSocket support needed at all? WebSockets would add long-lived connections to a process that has none today.
- How do users map an arbitrary response to a value, without building a transformation language?

### ST-021: Public securities catalog (stocks and ETFs)

**Objective:** Users can search for, select, or create a stock or ETF, hold it across investment accounts, and edit its record in a form view.

**Scope:** One securities model for both stocks and ETFs, since they share the same behavior. A security describes the instrument itself (such as ticker, name, type, exchange, trading currency, and provider identifiers), not anyone's holding. Includes the add-holding search-and-select flow and an editable security form view on ST-005. Works fully without any market-data provider; automated prices are ST-017.

**Acceptance criteria:**
- When adding a stock or ETF to an investment account, a user can search existing securities, select one, or create a missing one.
- Holding 10 shares of a security in one account and 5 in another produces two independent positions referencing one security.
- A security record opens in a form view on the shared foundation, with permitted fields editable directly.
- Two securities sharing a ticker on different exchanges can coexist and be told apart.
- One user's custom entries and holdings are never visible to another user.

**Dependencies:** ST-015.

**Relevant existing architecture:** No reference table in the schema is global today: `CLAUDE.md` requires data queries to be scoped by `userId`, and `User` has no admin role, only the group-scoped `GroupRole`. `createSieve` provides search for user-owned records, and `Category` shows a user-scoped record pattern. No generic picker component was found.

**Open questions:**
- **Should securities be globally shared, user-owned, or global with user-created entries?** User-owned fits the current isolation rule and has no curation problem, at the cost of duplicates per user. A global catalog gives better data and easier provider linking but needs a curation path that doesn't exist and would be the first table outside user scoping. The mixed option is the most complex.
- What uniquely identifies a security, given that tickers alone do not? Symbol plus exchange is the likely start.
- Which fields can users edit if a provider also supplies them?

### ST-022: Custom and non-public assets

**Objective:** Users can create and manage assets that are not publicly traded, such as real estate, private-company shares, business stakes, and private investments.

**Scope:** User-owned asset records (such as name, category, description, currency, valuation method, and valuation source) in a form view on ST-005, with holdings capturing quantity or ownership interest. Valuation is manual by default. These assets are not forced into stock or ETF fields.

**Acceptance criteria:**
- A user can create, edit, and remove their own custom assets, and no other user can see them.
- An asset record opens in a form view on the shared foundation, with direct field editing.
- A user can hold a custom asset in an eligible account, including as a percentage or ownership interest if discovery confirms that need.
- Manual valuations show their date and source, count toward account value and net worth, and are marked when stale.

**Dependencies:** ST-015.

**Relevant existing architecture:** Nothing equivalent exists. ST-015 decides the holding and instrument relationship that this builds on.

**Open questions:**
- Do custom assets need a separate model, or can they share the instrument record with `kind`? Fields that apply only to securities or only to custom assets are the deciding test.
- Does a private asset held once need separate asset and holding records at all, or can the interface present them as one record?

### ST-023: Multi-currency balance correctness

**Objective:** Each account's balance is correct in its own currency, and cross-currency movements keep an auditable record of what actually happened, so every figure built on those balances can be trusted.

**Scope:** Persist the amount actually applied to each account, along with the execution details of cross-currency transactions and transfers. Suggest rates and received amounts, and let the user correct them. Add exact crypto precision and a correction history. This stays inside the existing `Transaction` model and balance calculation, with no separate balance system, accounting engine, or duplicate transaction logic.

**Decisions:**

- **Execution timestamp:** ST-023 uses ST-001's `Transaction.date` UTC execution instant, with no second timestamp column and no offset column.
- **Crypto precision:** Native amounts use `Decimal(30,18)` and exact decimal arithmetic.
  - **Columns:** `Account.initialBalance`, `Transaction.amount`, and the new applied, destination, fee, and applied-rate columns.
  - **Unchanged:** `amountInPreferredCurrency`, `exchangeRate`, and `ProviderImportedTransaction.amount`. Shared-expense and settlement columns also stay as they are, so crypto-denominated sharing and settlement are rejected for now.
  - **Fiat:** Fiat still accepts and displays 2 decimals, with existing rounding. The wider column doesn't change its behavior.
  - **Exact path:** Native amounts travel as decimal strings in requests and responses, and balances are calculated with `Prisma.Decimal`. Preferred-currency valuations stay rounded numbers.
- **Correction audit:** One append-only `TransactionCorrection` table, not a generic event system.
  - Each row holds the transaction, who changed it, when, and the previous and corrected financial values.
  - `update.service.ts` writes it in the same database transaction whenever a financial field changes.
  - Deleting a transaction adds a final row that survives the deletion.
  - `updatedAt` alone can't satisfy this, because it records neither who nor the previous values.
- **Existing test data:** Incorrect financial test records may be reset instead of migrated, under the pre-production data policy.

**Financial invariants:**
- An account's actual balance is maintained in its native currency.
- Its value in another currency is a separate, dynamic valuation at a current rate. Rate movements never change the native balance.
- The amounts applied to each account are persisted, so historical balances never depend on future rates.
- Applied amounts are authoritative for balances. A recorded fee is an audit detail and is never subtracted a second time.
- A fee is recorded only when explicitly known. When a provider exposes only a net received amount, no fee is invented, and the implied rate is labeled effective rather than stated.
- ST-008, ST-014, and every other balance consumer use this one balance calculation.

**Acceptance criteria:**
- A transfer of 100 USD to an MXN account reduces the source by 100 USD and adds the MXN amount actually received, not 100 MXN.
- A transaction whose currency differs from its account's changes the balance by the persisted amount in the account's currency.
- Each cross-currency record shows source amount and currency, destination amount and currency, execution time, applied rate, and any known fees.
- A later exchange-rate change alters neither native balances nor recorded execution details, and it does alter current-value conversions.
- The rate and received amount are suggested when possible. The user can override the received amount and correct the recorded rate and fees.
- Without an explicit fee, the record shows no fee and an effective rate.
- A correction keeps the persisted amounts, details, and resulting balances consistent, and adds a `TransactionCorrection` row with the previous and corrected values, who changed them, and when. Rows are never updated.
- Create, edit, settlement approval, and import paths all persist the applied amounts and the correct execution date form.
- 1.234567890123456789 BTC can be entered, stored, summed into a balance, returned, and displayed without changing a digit. An amount with more than 18 decimals is rejected, not rounded.
- Fiat amounts, displays, and rounding behave as before.
- Sharing or settling a crypto-denominated transaction is rejected with a clear message.
- The API documentation describes the new date and decimal-string contracts.
- Same-currency transfers and transactions keep their balance behavior.
- Affected test records follow the pre-production data policy, and no amount is guessed silently.
- The temporary ST-008 cross-currency disclosure is removed.

**Dependencies:** ST-001's UTC execution instant (B-001), and ST-007's first batch (B-009), so transaction form changes happen in one place. ST-014 and ST-015 depend on this intent.

**Relevant existing architecture:**

| Existing field | What it is today | Role in ST-023 |
|---|---|---|
| `amount` + `executionCurrency` | What was executed; usable as source amount and currency | Keep |
| `exchangeRate` | Execution currency to the *preferred* currency, captured when the record is written | Not the applied rate; don't reuse it for this |
| `amountInPreferredCurrency` | Display snapshot, shown on the detail page and not recomputed when the preferred currency changes | Not a balance or audit value |
| `date` | `TIMESTAMP(3)` holding the UTC execution instant, per ST-001 | Authoritative execution timestamp |

So the missing data is the applied account amount when currencies differ, the destination amount, the applied rate, and a known fee with its currency. Discovery tests whether fewer fields can cover them. `serialize` converts every `Decimal` to a JavaScript number, and `moneySchema`, `amountToNumber`, and `roundMoney` also use numbers, none of which can hold 18 decimals exactly. About 31 web references across 17 files and 25 API call sites need review. Prisma's `Decimal` is already available in the API, and the web app has no decimal library and should only format these strings. Crypto can already be selected as an account currency. `calculateAccountBalance` is the one balance calculation, reached only through `listAccounts`; it applies the raw `amount` to both sides of a transfer and ignores `executionCurrency`. The transaction form lets a user pick a currency other than the account's, so the gap is reachable today. Settlement approval already writes each side in its account's currency, but it keeps no applied rate. Rates are live with no history, so a past-dated record can only get a suggestion at today's rate. `Transaction` has only `updatedAt` for change tracking, and no audit table exists. Local staging has 13 transactions in a currency other than their account's, 0 cross-currency transfers, and no crypto accounts; production wasn't inspected.

**Open questions:**
- How should an explicit fee affect reports? Reports exclude transfers today, so a transfer fee recorded only as a detail wouldn't appear as an expense.
- What is the smallest coherent reset under the pre-production data policy? Transactions connect to shared expenses, settlements, relations, and imported-transaction links, so the proposal must map those dependencies and the records actually affected, including existing timed rows that lack an offset. Any destructive operation needs explicit approval of the exact operation.

## Implementation Batches / PR Execution Plan

This plan is the authoritative execution order. Each batch is one focused pull request, and the plan is strictly sequential: **a batch doesn't start until the previous one is completed, tested, reviewed, approved, merged, and closed.** Nothing has been started, so every batch is `Planned`.

| Batch | Intent(s) | Objective | Dependencies | Estimated Size | Status |
|---|---|---|---|---|---|
| B-001 | ST-001 | Enter, show, filter, group, and report transaction date and time in the client's timezone | None | L | Planned |
| B-002 | ST-003 | Convert an existing transaction to shared | None | S | Planned |
| B-003 | ST-002 | Keep users logged in on trusted devices | None | M | Planned |
| B-004 | ST-004 | Neutral charcoal dark theme | None | S | Planned |
| B-005 | ST-009 | Bulk delete and retention for imported transactions | None | M | Planned |
| B-006 | ST-005 | Shared Form View, proven by migrating Profile | None | M | Planned |
| B-007 | ST-008 | Net worth and savings rate on Profile | None | M | Planned |
| B-008 | ST-006 | Account Form View | B-006 | M | Planned |
| B-009 | ST-007 part 1 | Directly editable existing transactions | B-002, B-006 | M | Planned |
| B-010 | ST-023 | Correct native balances with auditable FX history and crypto precision | B-001, B-009 | L | Planned |
| B-011 | ST-013 | Credit limit and available credit | B-008 | S | Planned |
| B-012 | ST-014 part 1 | Statements, dates, and unpaid status | B-011 | M | Planned |
| B-013 | ST-007 part 2 | Prefilled new transaction drafts | B-009 | S | Planned |
| B-014 | ST-014 part 2 | Statement payments and their accounting | B-010, B-012, B-013 | L | Planned |
| B-015 | ST-014 part 3 | One reminder per statement | B-014 | M | Planned |
| B-016 | ST-010 | Notification regex rules | B-006 | M | Planned |
| B-017 | ST-011 | Notification ingestion endpoint | B-016 | M | Planned |
| B-018 | ST-015 part 1 | Manual holdings and valuations | B-008, B-010 | M | Planned |
| B-019 | ST-015 part 2 | Aggregate value and net-worth integration | B-007, B-018 | S | Planned |
| B-020 | ST-016 | Automatic crypto holding prices | B-019 | S | Planned |
| B-021 | ST-021 | Public securities catalog | B-019 | M | Planned |
| B-022 | ST-022 | Custom and non-public assets | B-019 | M | Planned |
| B-023 | ST-017 | Stock and ETF market data | B-021 | M | Planned |
| B-024 | ST-018 part 1 | Secure exchange credential storage | B-018 | M | Planned |
| B-025 | ST-018 part 2 | Binance quantity sync | B-024 | M | Planned |
| B-026 | ST-019 | On-chain wallet sync | B-018 | M | Planned |
| B-027 | ST-020 | User-configured external sync | B-018, B-024 | L | Planned |

Sizes are relative engineering estimates, not time commitments. Dependencies list only real technical prerequisites; the order above still applies to every batch.

**Where to start:** B-001 comes first. It fixes a confirmed problem that affects every user away from UTC, and merging it unlocks B-002.

**Split intents:** An intent that spans batches is complete only when its last batch merges.

| Intent | Batches | Why it is split |
|---|---|---|
| ST-007 | B-009, B-013 | Drafts have no consumer until ST-014 |
| ST-014 | B-012, B-014, B-015 | Its statements, payment accounting, and reminders are independently reviewable |
| ST-015 | B-018, B-019 | Net-worth integration is the main double-counting risk, so it gets its own review |
| ST-018 | B-024, B-025 | Secret storage needs its own security review, and ST-020 reuses it |

**L batches kept whole:**
- **B-010:** Splitting it would merge balances that disagree with their recorded execution details. **It is the largest batch and sits at the top of the L range:** it combines FX persistence, an API number-to-string contract change, and correction history across four write paths. Its proposal should confirm that it fits one reviewable PR. The decimal-string contract is the main size risk.
- **B-014:** Splitting declared payments from recorded transactions would merge a state that can break the no-double-counting invariant.
- **B-027:** It may be dropped at its go/no-go check. If it goes ahead, discovery should re-evaluate splitting it.

**External feasibility and provider risks:**

| Batch | Check before starting |
|---|---|
| B-016, B-017 | Whether iPhone automations can read bank notifications. Test on real devices. If this fails, reconsider both batches. |
| B-020 | Whether the USDT-as-USD assumption is accurate enough for displayed valuations |
| B-023 | Provider choice, rate limits, and display and redistribution licensing |
| B-024, B-025 | Whether the production host can reach the Binance account API; regional and hosting restrictions may block it |
| B-026 | RPC or indexer provider, and whether a fixed token list is enough |
| B-027 | Whether the need remains after B-020 to B-026 (go/no-go); this is the first user-controlled outbound request |

### Batch details

Unless noted, a batch meets its intent's full acceptance criteria. The completion rules below apply to all of them.

**B-001: ST-001 (Odoo task #129).**
- **Deliverable:** One date-and-time field on the create and edit forms, local display, timestamp-preserving edits, half-open API date ranges, a report `timeZone`, client-local filters, grouping, and cashflow buckets, MCP datetime filters, and provider-date display.
- **Prerequisites:** None.
- **Testing:** Independent date and time edits, positive and negative offsets, both DST days, month boundaries, invalid timezones, unchanged timestamps, provider dates, and date-only requests.
- **Done when:** All ST-001 acceptance criteria are met.

**B-002: ST-003 (Odoo task #127).**
- **Deliverable:** Sharing controls in the transaction edit view, using the existing backend path.
- **Prerequisites:** None. It precedes B-009, which must preserve it.
- **Testing:** Conversion on both layouts, transfer rejection, and share limits.
- **Done when:** A converted transaction appears as shared in the list and in debts.

**B-003: ST-002 (Odoo task #128).**
- **Deliverable:** The login option, the fix for the logout cause found in discovery, revocation on password change, and corrected `CLAUDE.md` wording.
- **Prerequisites:** None. The cause of mobile logouts is identified first.
- **Testing:** Session lifetime both ways, logout, password change, and token rotation.
- **Done when:** The session survives reopening on mobile and desktop.

**B-004: ST-004.**
- **Deliverable:** A central dark palette change. It comes before new UI so later batches inherit it.
- **Prerequisites:** None.
- **Testing:** Visual check of light and dark modes, contrast, charts, and native selects.
- **Done when:** Dark surfaces have no dominant blue tint, and light mode is unchanged.

**B-005: ST-009.**
- **Deliverable:** Bulk delete and oldest-first retention.
- **Prerequisites:** None. The resurrection approach is decided first.
- **Testing:** Limit boundaries, re-sync, user isolation, and preservation of linked records.
- **Done when:** A deleted record behaves as agreed on the next sync.

**B-006: ST-005.**
- **Deliverable:** The shared Form View, with Profile migrated onto it.
- **Prerequisites:** None. The rule for unsaved-change protection is decided first.
- **Testing:** Existing Profile tests stay valid, plus one non-Profile test consumer.
- **Done when:** Profile's UX is unchanged and the shared code names no model.

**B-007: ST-008.**
- **Deliverable:** `GET /reports/financial-overview` and the Financial overview section. Requires no migration.
- **Prerequisites:** None. It follows B-006 so the General tab changes once.
- **Testing:** Service tests for each disclosure, missing rates, zero income, settlement neutrality, month selection, and user isolation.
- **Done when:** Both metrics show correctly labeled figures, and a failure in one leaves the other metric and Profile working.

**B-008: ST-006.**
- **Deliverable:** An account route and view on the shared Form View, with clear `checking` labeling.
- **Prerequisites:** B-006.
- **Testing:** Ownership, field editing, existing actions, and mobile width.
- **Done when:** Every account type opens a linkable, editable view.

**B-009: ST-007 part 1.**
- **Deliverable:** Directly editable existing transactions on the shared Form View.
- **Prerequisites:** B-002 and B-006.
- **Testing:** Coupled-field rules, invalid in-between states, sharing, old edit links, and stored times surviving unrelated edits.
- **Done when:** All ST-007 criteria except new drafts are met.

**B-010: ST-023.**
- **Deliverable:** Persisted applied amounts and execution details for cross-currency records, correct native balances, suggested and correctable rates and received amounts, `Decimal(30,18)` native crypto amounts with exact arithmetic, the `TransactionCorrection` history, and the form changes they need.
- **Prerequisites:** B-001 and B-009. The proposal documents any reset, and the exact operation is separately approved before execution.
- **Testing:** Balance calculation across currency combinations, rate changes leaving balances and history untouched, net-only versus explicit-fee records, an 18-decimal round trip, fiat behaving as before, correction rows, every write path, and no change for same-currency records.
- **Done when:** Native balances are exact and correct, each cross-currency record has an auditable history, and every financial correction records who changed what and when.

**B-011: ST-013.**
- **Deliverable:** The credit limit, derived available credit, and the debit-card inference fix.
- **Prerequisites:** B-008.
- **Testing:** Over-limit, overpaid, and no-limit cards, plus type inference.
- **Done when:** Limit, outstanding balance, and available credit show on the account view.

**B-012: ST-014 part 1.**
- **Deliverable:** Statements with dates, amount, and status. No payment can be recorded yet, so outstanding and overdue highlighting waits for B-014 to avoid false alarms.
- **Prerequisites:** B-011. The accounting mechanism and statement storage are decided first.
- **Testing:** Cycle boundaries, short months, and a new cycle starting unpaid.
- **Done when:** A card shows its statements, separately from its current balance and available credit.

**B-013: ST-007 part 2.**
- **Deliverable:** A prefilled new-transaction draft at its own URL.
- **Prerequisites:** B-009.
- **Testing:** Nothing is created until save; abandoning a draft leaves no record.
- **Done when:** The remaining ST-007 criteria are met.

**B-014: ST-014 part 2.**
- **Deliverable:** The partial and full payment flow, the modal, optional transaction creation through a draft, the chosen accounting mechanism, and outstanding and overdue highlighting.
- **Prerequisites:** B-010, B-012, and B-013.
- **Testing:** The $30,000/$10,000/$2,000/$12,000/$6,000 scenario, multiple partial payments, later matching, linked edits and deletes, and net worth.
- **Done when:** Every balance change from a payment traces to one record and never applies twice.

**B-015: ST-014 part 3.**
- **Deliverable:** In-app reminders, delivered once per statement.
- **Prerequisites:** B-014, so a fully paid statement gets no reminder.
- **Testing:** Restarts, repeated scheduler runs, and paid statements.
- **Done when:** All remaining ST-014 criteria are met.

**B-016: ST-010.**
- **Deliverable:** Rule configuration on the shared Form View, a sample-text test, and safe regex evaluation.
- **Prerequisites:** B-006 and the device feasibility check.
- **Testing:** Activation rules, pathological patterns, oversized input, and user isolation.
- **Done when:** A user can test and activate a rule, and no pattern can stall the API.

**B-017: ST-011.**
- **Deliverable:** The ingest endpoint, a restricted credential, and the review flow.
- **Prerequisites:** B-016.
- **Testing:** Duplicates, limits, cross-user isolation, and no notification text or credentials in logs.
- **Done when:** An automation can send text and get a reviewable record.

**B-018: ST-015 part 1.**
- **Deliverable:** Holdings and manual valuations on the account view, with manual crypto portfolios as the first use. Account value and net worth don't change yet.
- **Prerequisites:** B-008 and B-010. The instrument reference and the relationship between holdings and balance are decided first.
- **Testing:** Multiple holdings, the same instrument across accounts, stale values, and ownership.
- **Done when:** Users can maintain positions, and existing balances are unchanged.

**B-019: ST-015 part 2.**
- **Deliverable:** Aggregate account value and holdings in the existing net-worth calculation.
- **Prerequisites:** B-007 and B-018.
- **Testing:** No double counting, stale and missing valuations, and removal of the `investment` disclosure for accounts with holdings.
- **Done when:** There is one net-worth calculation, and it includes holdings.

**B-020: ST-016.**
- **Deliverable:** Market values on crypto holdings, with manual overrides taking priority.
- **Prerequisites:** B-019.
- **Testing:** Override priority, unsupported assets, and unavailable prices never showing zero.
- **Done when:** A supported holding shows a timestamped market value.

**B-021: ST-021.**
- **Deliverable:** One securities model, search-select-create when adding a holding, and a security form view.
- **Prerequisites:** B-019. The ownership model is decided first.
- **Testing:** Two positions in one security, the same ticker on different exchanges, and user isolation.
- **Done when:** It works fully without a market-data provider.

**B-022: ST-022.**
- **Deliverable:** Custom asset records in a form view, holdable in eligible accounts.
- **Prerequisites:** B-019.
- **Testing:** Ownership, manual valuation, stale marking, and net-worth inclusion.
- **Done when:** A custom asset counts toward account value and net worth.

**B-023: ST-017.**
- **Deliverable:** One provider's optional prices for catalog securities.
- **Prerequisites:** B-021 and the provider and licensing check.
- **Testing:** Provider failure, rate limits, delayed labels, and override priority.
- **Done when:** Supported holdings show sourced prices, and failures leave the last value visible as stale.

**B-024: ST-018 part 1.**
- **Deliverable:** Encrypted per-user credentials, plus connect, read-only verification, and revoke.
- **Prerequisites:** B-018, the host reachability check, and a security review of encryption and key management.
- **Testing:** Secrets absent from responses and logs, rejected trading keys, and removal on disconnect.
- **Done when:** A user can connect and revoke a verified read-only key.

**B-025: ST-018 part 2.**
- **Deliverable:** Quantity sync into holdings through `FinancialProviderAdapter`, with sync status.
- **Prerequisites:** B-024.
- **Testing:** Refresh, failures keeping the last quantities, and manual overrides.
- **Done when:** All remaining ST-018 criteria are met.

**B-026: ST-019.**
- **Deliverable:** Public-address balances for a limited set of chains, read into holdings.
- **Prerequisites:** B-018 and the provider and chain decisions.
- **Testing:** No key or signature requests, unsupported assets, and failed syncs.
- **Done when:** A pasted public address produces holdings that refresh by sync.

**B-027: ST-020.**
- **Deliverable:** Configurable outbound sources with SSRF protection, if the go/no-go check confirms the need.
- **Prerequisites:** B-018, B-024, and the go/no-go check.
- **Testing:** Blocked private and metadata addresses, DNS rebinding, redirects, timeouts, and size limits.
- **Done when:** A user can configure and test a source, with every request protected.

### Completion rules

A batch is complete only when:
1. Its agreed scope is implemented.
2. `npm run typecheck`, `npm run lint`, and `npm run test` pass locally, since no CI checks pull requests.
3. Existing relevant behavior is preserved.
4. The PR has been reviewed and approved.
5. The PR has been merged into `razs_ai`.
6. The working branch is synchronized with `razs_ai`.
7. The batch and intent statuses in this roadmap are updated.
8. Any associated Odoo task updates are handled through the approved workflow.
9. No uncommitted temporary artifacts remain.
10. The next batch can start without depending on unfinished work.

### Branching and PR workflow

For each batch:
1. Start from the latest `razs_ai` on a dedicated feature branch.
2. Open one focused PR targeting `razs_ai`.
3. Complete review and merge before beginning the next batch.

`main` is the production branch. Merging `razs_ai` into `main` is a separately approved release step. No batch merges into `main` or deploys automatically.

### Intent dependencies

This shows technical dependencies between intents; the batch table sets the order.

```
Independent   ST-001   ST-002   ST-004   ST-009

ST-005 --+--> ST-007 --+--> ST-023 ---------+
         |             |                    v
         |             +------------------> ST-014
         |                                  ^
         +--> ST-006 --+--> ST-013 ---------+
         |             |
         |             +--> ST-015 --+--> ST-016
         |                           +--> ST-018 --> ST-020
         |                           +--> ST-019
         |                           +--> ST-021 --> ST-017
         |                           +--> ST-022
         +--> ST-010 --> ST-011

ST-001 --> ST-023 (execution instant and shared date helper)
ST-023 --> ST-015 (exact crypto quantities)
ST-008 --> ST-015 (net-worth integration only)
ST-003 --> ST-007 (sequence only, so ST-007 preserves sharing)
```

## Deferred decisions and research questions

These belong to the relevant intent's discovery and are deliberately not decided here. External findings are from research on 2026-11-05, largely secondary sources, and should be verified.

**Market data (ST-016, ST-017)**
- Reported free tiers: Twelve Data 8 requests/minute and 800/day (delayed); Finnhub about 60/minute with a free WebSocket; Alpha Vantage 25/day; Tiingo about 1,000/day. Massive (formerly Polygon) has conflicting reports on a free tier. CoinGecko is an alternative to Binance for crypto.
- Yahoo Finance reportedly has no official API (unverified), and unofficial endpoints carry terms-of-service risk.
- Display and redistribution licensing has not been verified for any vendor.

**Form View (ST-005)**
- Whether in-app navigation blocking justifies moving to a data router.

**WebSocket and sync architecture (ST-017 to ST-020)**
- Keep instrument metadata, holding quantity, market price, account valuation, and external synchronization distinct.
- Distinguish quantity sync, price sync, account-balance sync, manual overrides, scheduled polling, and streaming. Each may have different answers.
- Do any of them need streaming, given that a personal-finance view tolerates delay? Persistent connections would be new infrastructure.
- Can scheduled jobs stay in the API process? This depends on the production instance count, which was not verified.

**Financial data model (ST-008, ST-013 to ST-015, ST-021, ST-022)**
- Asset/liability classification, the holdings representation, its relationship to derived balances, and statement storage.
- The single authoritative accounting representation for card payments, and how later transactions reconcile with declared payments (ST-014).
- Which instrument concepts need independent persistence, and whether securities are global, user-owned, or mixed (ST-015, ST-021, ST-022).
- How cross-currency transfers should record a destination amount (ST-023).
- How `ROADMAP.md` Milestones 11-15 should be reconciled once these are decided.

**Binance (ST-018)**
- Spot `listenKey` was reportedly retired in 2026 in favor of WebSocket API subscriptions, and Binance.US reportedly plans the same. The primary changelog was not found.
- Balance events are account streams and prices are market streams; the two are separate concerns.
- Regional and hosting restrictions may determine feasibility.

**Wallet libraries (ST-019)**
- Whether any wallet-connection library is warranted, and which RPC or indexer provider to use. Reported free-tier figures conflict.

**API credential details (ST-011, ST-018, ST-020)**
- How an ingest scope fits the existing `read`/`write` model and UI.
- Encryption, key management, and rotation for readable secrets.

**Notification automation (ST-010)**
- Real-device confirmation of iOS triggers, unattended "Run Immediately" behavior, and which of the user's banks send SMS or email.
- Android 15 sensitive-notification behavior, and restricted settings for sideloaded automation apps.

**SSRF (ST-020)**
- A starting checklist is in the [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html): HTTPS only, validate all resolved addresses, pin the validated IP, disable or re-validate redirects, and limit time and response size.
