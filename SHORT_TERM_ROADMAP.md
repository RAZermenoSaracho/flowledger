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
| ST-001 | Correct transaction execution date and time | High | None | Completed | Task #129 |
| ST-002 | "Keep me logged in on this device" | High | None | Completed | Task #128 |
| ST-003 | Convert an existing transaction to shared | High | ST-007 | Completed | Task #127 |
| ST-004 | Neutral charcoal dark theme | Medium | None | Completed | None |
| ST-005 | Reusable Editable Form View Foundation | High | None | Completed | None |
| ST-006 | Account Form View | High | ST-005 | Completed | None |
| ST-007 | Transaction Form View | Medium | ST-005 | Completed | None |
| ST-008 | Personal Financial Metrics | Medium | None | Completed | None |
| ST-010 | Notification processing models (sandboxed Python) | Medium | ST-005 | Planned | None |
| ST-011 | Asynchronous notification ingestion endpoint | Medium | ST-010 | Planned | None |
| ST-032 | Community notification model library and versioning | Medium | ST-010 | Planned | None |
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
| ST-023 | Multi-currency balance correctness | High | ST-001, ST-007 | Completed | None |
| ST-024 | Group overview and Group Form View | Medium | ST-005 | Completed | None |
| ST-025 | Access-token purpose validation | Critical | None | Complete | None |
| ST-026 | Account identity and session hardening | High | ST-025 | Complete | None |
| ST-027 | Financial data isolation | High | ST-025 | Complete | None |
| ST-028 | Authenticated root routing and tokenless Google callback | Medium | ST-025 | Complete | None |
| ST-029 | API and deployment hardening | Medium | ST-025 | Complete; owner settings open (KNOWN_ISSUES #046) | None |
| ST-030 | Remove the legacy stored access token | Low | None | Complete | None |
| ST-031 | Enforce the application Content Security Policy | Medium | None | Complete; owner credentialed checks open (KNOWN_ISSUES #046) | None |

ST-012 (debit support) is retired and has no active row; see its note under the intent details. IDs are stable and are not reused or renumbered, so numeric order is not execution order.

## Intent details

### ST-001: Correct transaction execution date and time

**Objective:** `Transaction.date` is a UTC execution instant everywhere. Users enter, see, filter, group, and report on it in their client's timezone, with DST handled correctly.

**Scope:** Replace the date-only create and edit fields with one native date-and-time field. Convert calendar filters to UTC instants at local-day boundaries, with optional time-of-day selection on date filters, using half-open intervals, and bucket monthly reports and grouping by client timezone. There is no schema change and no compatibility layer for older test records, and no data is changed. Timestamps that aren't transaction dates keep their existing display.

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

### ST-003: Convert and edit shared transactions, with consent and privacy

**Objective:** A user can make an existing transaction shared, and edit or disable its sharing, from its Sharing tab on mobile and desktop. Sharing is consent-based and privacy-preserving: participants accept or reject, users can block each other, and users see one another only through a public username identity.

**Scope:** Extend the Sharing tab that ST-007 introduces (create-time sharing) to existing transactions, and add the consent, blocking, public identity, and universal invitation capabilities below. The sharing change is saved atomically through the existing transaction update request (`PUT /transactions/:id` accepts an optional `sharedExpense`), applied by one transaction-scoped helper in the shared-expenses module; `PUT /shared-expenses/:id` is re-pointed at the same helper and no longer deletes and recreates rows. ST-003 owns B-004's single Prisma migration. Its data-backfill SQL (generated usernames, `accepted` backfill) requires the owner's explicit approval at apply time, per the raw-SQL rule in `CLAUDE.md`.

Capabilities (each its own spec in the ST-003 change): `transaction-sharing-conversion`, `shared-expense-consent`, `user-blocking`, `public-user-identity`.

**Acceptance criteria:**
- From the Sharing tab on mobile, a user can convert an existing transaction to shared and save.
- The same flow works on desktop.
- A user can also edit shares, add or remove participants, and disable sharing on an existing shared transaction, saved in one atomic request. A failed save (400/409/network) leaves the server unchanged and the draft intact.
- The transaction then appears as shared in the list and in the relevant balances and debts, counting only accepted shares.
- Transfers still cannot be shared, and shares cannot exceed the amount. Switching a shared transaction to `transfer` is rejected while the shared expense has payments or pending settlements.
- Participants receive the usual notifications, now as `shared_expense_invited`, `shared_expense_updated`, `shared_expense_accepted` and `shared_expense_rejected` (at most one unread per recipient, shared expense and type).
- Settlement guards hold on every entry point (web, `/v1`, MCP), each rejected with a field-addressable 400:
  - A share cannot drop below its paid amount plus pending settlement requests.
  - A participant can be removed only with nothing paid and no pending settlement request.
  - Unsharing, and deleting the shared expense or its transaction (`DELETE /transactions/:id` gains this guard), are rejected while any payment or pending/approved settlement exists.
  - The expense/income flip is rejected when payments or pending requests exist.
  - Fully paid shares are locked.
- Participant consent: each app-user share is `proposed`, `accepted` or `rejected`, separate from the payment status.
  - Only the participant can accept or reject, and only while `proposed` (`POST /shared-expenses/:id/accept` and `/reject`, also via `/v1` and MCP); the owner can never set it.
  - Only accepted shares count in debts, totals, person balances, settlement requests and ST-008 net worth. Proposed shares are shown as awaiting acceptance; rejected ones show as rejected to the owner.
  - Raising an accepted share or flipping its direction returns it to `proposed` and notifies the participant; lowering it or non-financial edits keep it accepted. A rejected share returns to `proposed` only when the owner changes its amount.
  - Existing app-user participants are backfilled as accepted; manual participants are always accepted.
  - The participant accepts or rejects from the Debts "awaiting acceptance" list and the notification target.
- User blocking: a user can block and unblock others (`GET/POST /users/blocks`, `DELETE /users/blocks/:userId`).
  - A blocked user cannot add the blocker, with the generic message "This user can't be invited."
  - Notifications from the blocked user are suppressed, and neither user appears in the other's search.
  - Blocking rejects the blocker's proposed shares from that user; accepted obligations, payments and settlements are untouched, and unblocking restores nothing.
  - Profile has a "Blocked users" tab, and an invitation offers "Reject and block". Group membership is unaffected.
- Public identity: every user has a unique, lowercase `username` (3-30 characters, `[a-z0-9._]`, alphanumeric at both ends, no consecutive dots, reserved names refused), generated on both signup paths and changeable in the Profile General tab (availability check authenticated, debounced and rate-limited; a concurrent clash returns 409 on the username field).
  - `identityVisibility` is `username_only` (default) or `username_and_name`.
  - Other users see only `{ id, username, displayName }`, never an email, phone, avatar or auth field; the label is `Name (@username)` or `@username`, with no email fallback. Own-profile endpoints keep private fields for the owner only.
  - This applies server-side on web, `/v1` and MCP: user search, group members, debts counterparties and person balances, settlement requests, shared-expense owner and participants (app-user participants render the live public label; manual participants keep the owner-entered name) and new notification text.
- User search is a username prefix match (minimum 3 characters, at most 10 results, exact match first), with no email or name matching, excluding self and blocks in both directions, and rate-limited per user.
- Universal invitations: any existing, unblocked app user or manual participant can be added to any shared expense, group or not (#019 is intentional behavior). A non-member participant sees only the shared expense and its transaction summary, never the Group's data; `/v1` and MCP use the same rule.
- Exactly one Prisma migration for B-004 (username, `identityVisibility`, `UserBlock`, `ShareAcceptance` and `SharedExpenseParticipant.acceptance`, new notification types); its backfill SQL is applied only with the owner's explicit approval.
- Covered by tests, including cross-user isolation.

**Dependencies:** ST-007. ST-003 is specified as its own change but extends the editing lifecycle of the Transaction Form View (ST-007), and ST-007 depends on ST-005. It also extends the Profile (ST-005) with username, visibility and a Blocked users tab built on `RelatedList`.

**Delivery:** Batch B-004, implemented together with ST-007 and immediately after it, because both share the same transaction editing lifecycle.

**Relevant existing architecture:** The control is missing on desktop too, not only on mobile. `TransactionEditPage.tsx` has its own form without `SharedParticipantsFields.tsx`. `updateTransactionSchema` omits `sharedExpense`, but `POST /shared-expenses` already accepts an existing transaction and the web client already uses it. Sharing is a `SharedExpense` with participants; debts derive from those participants. `normalizeSharedExpenseParticipants` currently checks group membership only when the transaction has a group, and `/v1` and MCP reject non-group transactions.

**Open questions:**
- `docs/KNOWN_ISSUES.md` #017 (amount edits do not rescale shares) is resolved by ST-007 (sum of shares must stay within the amount). #019 is reclassified as intentional supported behavior, protected here by consent, blocking and privacy. #037 (group-add consent) stays open; its email exposure is addressed here by public identity.

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

**Objective:** FlowLedger has one reusable, Odoo-inspired form view, so models reuse the entire editing experience and not merely individual inputs. Users open a record and edit its values directly, with no Edit button and no edit mode.

**Scope:** Extract the common experience from Profile into a model-agnostic foundation, and migrate Profile onto it within this intent as its first real consumer. Accounts, Transactions, and Groups adopt it separately (ST-006, ST-007, ST-024).

| Shared Form View owns | Each model view owns |
|---|---|
| Form structure, sections, and tabs | Data fetching and API mutations |
| Editable-field wrapper (the control is always rendered), focus, and dirty marker | Authorization |
| Draft values, dirty state, and read-only display | Business validation |
| Compact header Save/Discard actions and one batch-save lifecycle | Field dependencies |
| Validation, loading, saving, and persistence-error presentation | Model-specific actions and specialized sections |
| Unsaved-change protection and responsive layout | Specialized financial calculations |
| Composition of custom field types | Custom field renderers |
| Tabs and the reusable `RelatedList` (rows, columns, add/remove, totals) | Row data, columns, and whether rows are part of the draft or immediate mutations |

The form is Odoo-inspired (used as a UX reference only) and FlowLedger-styled. There is no Edit button, edit mode, or click-to-activate: `EditableField` always renders its control, quietly styled (no heavy border at rest, a visible hover/focus ring, a distinct dirty marker), while `readOnly` fields render plain text with no input. Blur does nothing and Escape reverts that one field. `FormView` owns small Save and Discard buttons in its header row (top-right; on mobile they stay in the row and wrap below the title only if needed). They are always rendered, disabled while clean, with an accessible name or title explaining why; Save shows a busy state and is disabled while saving or invalid, targets are at least 40px and never full-width, `saveError` shows inline under the header, and Ctrl/Cmd+S saves when dirty. There is no sticky bottom bar. Tabs generalize the `ProfileTabs` tablist, and switching tabs never prompts because the draft persists.

`RelatedList<Row>` is a reusable list for related records: `title`, `rows`, `rowKey`, `columns` (render-prop cells, so an inline-editable cell is an `EditableField`), loading/empty/error states, optional add and remove, and a `footer` for totals. It renders a table from `sm` up and stacked label/value rows below. New rows carry a client `tempId` until saved, row errors use dotted `fieldErrors` keys (`participants.2.share`), and Escape in a cell reverts only that cell. It holds no domain logic.

Direct editing does not mean persisting each field on change: edits accumulate in a draft and save together, so coupled fields stay atomic. Each model supplies its own save function behind that one lifecycle.

**Not built here:** a schema-driven form engine, field-definition DSL, plugin registry, ORM abstraction, global form-state framework, or second data-fetching layer. The shared code contains no model conditions such as `if (model === 'transaction')`; it uses composition, typed props, and small focused hooks.

**Acceptance criteria:**
- Profile runs on the shared Form View, its own copy of the common lifecycle is gone, and no behavior is lost, including tab switching that keeps the draft and avatar upload on save. Fields are now directly editable instead of click-to-activate, so Profile's tests rewrite their click-to-activate selectors.
- A non-Profile test consumer gets the full lifecycle (draft, dirty state, Save/Discard, validation, saving, and persistence errors) by supplying only its fields, initial values, validation, and save function.
- The shared code contains no reference to any specific model.
- Fields are directly editable with no Edit button, edit mode, or click-to-activate, and support tap and keyboard use, including Escape to revert the field, with read-only fields rendered as non-editable text.
- Save and Discard sit in the FormView header, disabled while clean, with Save busy while saving and disabled while invalid, and Ctrl/Cmd+S saves when dirty.
- Tabs are supported, and switching tabs keeps the draft without prompting.
- A reusable `RelatedList` renders a table at `sm` and above and stacked rows below, supports render-prop cells, add/remove, totals footer, and loading/empty/error states, and contains no model logic.
- Text, select, textarea, and custom fields are supported, with field-level validation shown next to the field.
- Loading, saving, and persistence-error states display consistently.
- Unsaved changes are protected according to the rule set in discovery.
- The form remains usable at mobile width, without iOS focus zoom.

**Dependencies:** None.

**Delivery:** Batch B-004, together with ST-006, ST-007, ST-003, ST-024, and ST-008. It is implemented first, as the shared foundation the others build on (ST-008 only coexists with its Profile migration).

**Relevant existing architecture:** Draft state is hand-written in three places (`useProfileDetails.ts`, `useAccountEditForm.ts`, `TransactionEditPage.tsx`), but only Profile has click-to-edit, dirty tracking, a persistence-error display, and an unload guard. `ProfileInlineField.tsx` has no Profile imports but only finds `input` and `select`. `ProfileTabs.tsx` has an accessible, URL-driven tablist but is hardcoded to Profile's tabs. Generic parts of `useProfileDetails.ts` are the draft diff, cancel, saving and error state, the guard, and validation gating of save. Profile-specific parts are name and email rules, avatar preview, display helpers, and the two-step save. The avatar file also counts as dirty, so the lifecycle needs custom save functions and an additional dirty source. Preferences, Security, and Subscription tabs use their own mutations and can stay independent. `ProfileHeader.test.tsx`, `ProfilePage.test.tsx`, and `ProfileInlineField.test.tsx` pin current behavior, which makes this migration a safe proof of no UX change. The web app uses TanStack Query and has no form library. Keep single selects native, per `openspec/specs/select-dropdowns`.

**Profile adoption decision:** Include Profile in this intent. An estimated 8-10 files change, it is the only reference implementation, and its existing tests prove reuse. A separate intent would leave a foundation with no consumer and two implementations in the meantime.

**Open questions:**
- Only `beforeunload` exists today. In-app navigation blocking is new: React Router's `useBlocker` needs a data router, and `main.tsx` uses `BrowserRouter`. Is `beforeunload` enough for the first version, or is a router migration justified?

**Adoption rule for current and future models:** Any independently editable record uses this foundation, including accounts of every type, transactions, regex configurations, securities, custom assets, and holdings that warrant their own record view. Later intents add fields and sections as model-owned composition, and none may introduce a separate form lifecycle. The foundation grows only when one of those consumers needs it.

### ST-006: Account Form View

**Objective:** Clicking an account opens a dedicated form view on the shared foundation, where its details can be edited directly (Odoo-inspired, with no Edit button and compact header Save/Discard) and its actions are available.

**Scope:** Add an account route and view composed from ST-005. Account-specific fields, validation, actions, and sections stay in the account domain. Show type-specific fields only where a real difference exists today. Move or link existing actions (sync, archive, delete). Later intents add sections for credit cards, crypto portfolios, and investment portfolios to this view, all under one form lifecycle. The account view has no related lists in B-004; future holdings reuse `RelatedList`.

**Acceptance criteria:**
- Clicking an account opens its own view at a linkable URL, and only the owner can reach it.
- Fields can be edited directly, with no Edit button, and validated through the shared Form View with its compact header Save/Discard, with no account-specific copy of its lifecycle.
- Sync status and archive/delete actions remain available for the account.
- The view works at mobile width.
- Not every account type is forced to show identical fields, and a type can add a section without touching the shared foundation.
- Account type labels make clear that `checking` covers debit and everyday bank accounts.

**Dependencies:** ST-005.

**Delivery:** Batch B-004, implemented after ST-005.

**Relevant existing architecture:** `AccountsPage.tsx` is the only account route. Clicking a row expands it (`AccountListItem.tsx`), and Edit swaps in an inline form (`useAccountEditForm.ts`) for name, type, identifier, currency, and initial balance. There is no type-specific logic. The UI shows the raw enum as the type label.

**Open questions:**
- Should editing be restricted for synced accounts? The UI shows only a badge today.
- What happens to the inline row form and row expansion once this view exists?

### ST-007: Transaction Form View

**Objective:** The transaction detail view becomes directly editable on the shared foundation, with no Edit button or edit mode, organized in Details, Sharing and Related tabs.

**Scope:** Move the transaction view onto ST-005, keeping all current behavior. Coupled-field rules and business validation stay in the transaction domain, and all fields save as one batch. The view has three tabs: Details (the transaction fields), Sharing (shared toggle, title, and a participants `RelatedList` in draft mode with participant, editable share, paid, acceptance status and remove columns, footer totals of allocated, owner's own share and unallocated, and an equal-split helper), and Related (read-only lists of real relationships only: settlement transactions linked via `TransactionRelation`, and the originating imported provider record; hidden when empty; no new models). ST-007 owns the shell and the Details and Related tabs, and create-time sharing on new drafts; ST-003 extends the Sharing tab to existing transactions. Sharing is saved in the same single request: `updateTransactionSchema` gains an optional `sharedExpense` (`{ enabled: false }` to unshare, or `{ enabled: true, title?, participants }`), applied inside the existing `prisma.$transaction` through one helper whose semantics ST-003 implements, so a failure leaves the server unchanged and the draft retryable. The view can also open a new, unsaved draft from initial values, which ST-014 needs. There is no transaction-specific form lifecycle.

**Acceptance criteria:**
- Fields can be edited directly from the transaction view with no Edit button or edit mode, with compact header Save/Discard.
- The view offers Details, Sharing and Related tabs; switching tabs keeps the draft, and the Related tab is hidden when empty.
- New drafts can be shared at creation from the Sharing tab, saved in one atomic request together with the transaction.
- Editing a transaction amount keeps the sum of shares within the amount, resolving `docs/KNOWN_ISSUES.md` #017.
- All current validation and business rules still hold, including the field couplings below and, once ST-003 lands, its sharing, consent and settlement-guard flow.
- A transaction cannot be saved in an invalid in-between state, such as a transfer without a destination.
- Saving other fields doesn't overwrite a stored execution time.
- Existing `/transactions/:id/edit` links keep working.
- A new transaction draft with prefilled values opens at its own URL and creates nothing until the user saves.
- The view works at mobile width.

**Dependencies:** ST-005. ST-003 extends this intent's editing lifecycle and ships after it in the same batch.

**Delivery:** Batch B-004, implemented after ST-005 and ST-006, with ST-003 following it. The prefilled-draft capability ships here, and ST-014 (B-008) consumes it.

**Relevant existing architecture:** `/transactions/:id` is read-only with an Edit button, and `/transactions/:id/edit` is a separate form linked from `TransactionsPage.tsx` and `TransactionDetailPage.tsx`. `TransactionEditPage.tsx` (362 lines) re-implements fields that the create form shares through `TransactionCoreFields`, so the two can drift. Coupled fields: choosing an account changes the currency; choosing transfer clears category, group, and sharing and requires a different destination; changing group resets the category and forces sharing. These rules are repeated in inline handlers today. Pure functions owned by the Transactions page could serve both create and edit while the foundation stays free of them. Creation currently happens only inline on the list page, and no prefill mechanism exists.

**Open questions:**
- Should the inline create form on the list page remain, or move to the same view as new drafts?

### ST-008: Personal Financial Metrics

**Objective:** The Profile General tab gives users an honest overview of their financial position and recent savings, using only data FlowLedger already has.

**Scope:** A compact, read-only "Financial overview" section with two metrics, backed by one read endpoint. There is no migration of its own (B-004's single migration belongs to ST-003), new classification, or user configuration. Receivables and payables count only accepted shared-expense shares (ST-003); proposed and rejected shares are excluded and disclosed as "N awaiting acceptance (not counted)". The metrics are computed information, so they compose into Profile without using the editable-field parts of ST-005.

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
- Only accepted shares count toward what people owe the user and what the user owes; proposed and rejected shares are excluded, and the section discloses how many await acceptance.
- Only the user's own data is included, and all calculation happens in the API.

**Dependencies:** None. It integrates into Profile and coexists with ST-005's Profile migration, but is read-only and has no dependency on form editing state.

**Delivery:** Batch B-004, implemented last, after ST-024, in the same PR as the other five intents.

**Relevant existing architecture:** Net worth is not computed anywhere, and the dashboard's "Current balance" is income minus expenses, not a sum of accounts. Balances are signed (`initialBalance + income - expense - transfers out + transfers in`), so card debt is already negative and no asset/liability classification is needed. A new `GET /reports/financial-overview`, in the read-only `reports` module, can reuse `withAccountBalances`, `getExchangeRate`, `listDebts`, and `calculateMonthlyCashflow`. `listAccounts`, `listDebts`, and the cashflow report each convert under one `Promise.all`, so one failed rate fails the whole call; the metrics need per-item handling without changing those endpoints. `listAccounts` doesn't exclude archived accounts by default. Rates are live with no stored history, and reports already convert past months at today's rate (`docs/DOMAIN_LOGIC.md`). Reports ignore the `exchangeRate` and `amountInPreferredCurrency` snapshots on `Transaction`, which aren't recomputed when the preferred currency changes. ST-001 makes report months follow the client's timezone. On the web, `GeneralTab.tsx` is a small definition list, `Card` is reusable, and `DashboardPage.tsx` has a private `Metric` component that could be lifted out. A self-contained component with its own query stays independent of `useProfileDetails`, so a metrics error can't affect editing.

**Progressive enhancement:**
- ST-023 corrects cross-currency balances and removes the related disclosure once affected test data follows the pre-production data policy. Exchange-rate movement can still change net worth, because it is a current valuation, but never an account's native balance.
- ST-014 decides how declared card payments affect net worth.
- ST-015 adds holdings to this same calculation (B-009) and removes the `investment` disclosure for accounts with holdings. It must not introduce a second net-worth calculation.
- Investment returns stay deferred on ST-015. Emergency fund coverage and fixed vs variable expenses wait for a confirmed need for the classification they share.

**Open questions:**
- A creditor with a shared expense that has no account gets a receivable, but no balance ever fell, so net worth overstates. Should those receivables be left out?
- Should debts with manual participants count? The default is yes, since they are real amounts owed.
- Should archived accounts with money in them count? The default is no, with the disclosure above.
- Is one month too noisy? The default follows the requested monthly definition. A three-complete-month average costs the same if real data proves noisy.
- Does existing test data make the metrics misleading, such as card payments recorded as expenses? The pre-production data policy applies; ST-008 adds no special handling to compensate for those records.

### ST-009: Imported-transaction bulk delete and retention (deferred)

Deferred to the Odoo Flowledger project backlog as task #130 (Flowledger project, Backlog stage). Requirements and open questions are preserved there; not scheduled in any batch.

### ST-010: Notification processing models (sandboxed Python)

**Objective:** Users define, test, and activate their own models that turn notification text into transaction proposals.

**Scope:** Constrained-Python `process(text, ctx)` scripts returning expense, income, transfer, or skip; named slots bound to the owner's accounts, categories and Groups; settings; a list view and a Form View with Form, Code, Playground, Queue and Logs tabs.
This replaces the earlier regex-field-rule plan.

**Acceptance criteria:**
- Users manage only their own models. Activation requires valid code and every required slot bound to an owned, non-archived record.
- The side-effect-free Playground shows a proposal and transaction preview, skip reason, or error without creating anything.
- An AST allowlist and restricted builtins guard execution in a fresh permission-restricted sandbox child process running CPython on WebAssembly (Pyodide).
- Limits are 2 s of script time, 256 MB resident memory, 4,000 input characters and 64 KB stdout; malicious scripts cannot stall the API.
- Node 24 runtime checks (permission model loads the Python runtime, memory cap, cold start) are part of the sandbox runner.

**Dependencies:** ST-005.

**Relevant existing architecture:** No regex, script or queue code exists. `createTransaction(userId, input)` is reusable; amounts are decimal strings, and a transfer is one row from `accountId` to `transferToAccountId`. The shared Form View and ListView are reusable. CSP forbids WebAssembly in the browser, so execution is server-side.

### ST-011: Asynchronous notification ingestion endpoint

**Objective:** A client sends text to a model and receives a run ID while processing creates at most one transaction.

**Scope:** `POST /v1/notification-models/:id/notifications`, a separate ingest-only API-key scope, a persistent per-model queue of `NotificationRun` rows and a separate worker process from the same `apps/api` codebase, supervised by PM2, with configurable global and per-user concurrency (`NOTIFICATION_PROCESSOR_MAX_CONCURRENT_GLOBAL`, `NOTIFICATION_PROCESSOR_MAX_CONCURRENT_PER_USER`). Transactions go directly through `createTransaction`; `ProviderImportedTransaction` staging is not used, and the Logs tab is the review surface.

**Acceptance criteria:**
- Accepted requests (JSON `{ "text": ... }` only) return 202 with `runId` once the run is persisted (503 if persistence fails); unknown, foreign or inactive models return 404. Ingest-only keys cannot call other routes, and read/write keys cannot ingest.
- Dedupe is per model, using `Idempotency-Key` or a text hash in a fixed 10-minute bucket; duplicates return the existing run.
- Enforce the shared `/v1` rate limit, 4,000-character text and at most 500 queued runs per owner (429 with `Retry-After: 60`); concurrency limits never reject acceptance.
- Scheduling is fair across users and models, and runs of one model start in FIFO order. Serializable database claims enforce global and per-user limits across all worker processes.
- The HTTP API never claims or executes runs. Worker stop, crash or restart leaves the API available and ingests returning 202 with durable queued runs; workers poll every 2 s without a wake signal.
- Each worker updates its liveness row every 15 s; processing runs of a worker stale for more than 2 minutes fail as `worker_lost`. Workers exit 1 before processing if the schema is not migrated, and PM2 restarts them with backoff. The unauthenticated `/health/notification-worker` reports only the count seen within 60 s (200 if positive, otherwise 503 with zero).
- No automatic retries: a run whose worker crashed becomes failed `worker_lost` with no transaction, and a run is completed only if its transaction was created in the same database transaction. Graceful shutdown returns aborted pre-creation runs to queued.
- Clear text 7 days after a run finishes and delete finished runs after 30 days. Notification text and credentials never appear in application logs.

**Dependencies:** ST-010.

**Relevant existing architecture:** Reuse hashed `fl_` API keys, credential middleware, `createRateLimiter` and `createTransaction`. The new scope is separate from read/write. No durable job queue exists today.

### ST-032: Community notification model library and versioning

**Objective:** Users share model versions and install independent copies using their own mappings.

**Scope:** Publish immutable numbered versions, browse the community library, install private copies, detect available updates and offer optional updates. Updates are never automatic.

**Acceptance criteria:**
- Published versions snapshot name, description, code, slots and settings, never bindings; the user sees what will be published before confirming.
- Installation creates an independent, inactive, private copy with empty bindings, its own endpoint and runs, and source-version tracking.
- A newer public version is shown as available; declining it leaves the copy usable.
- An optional update keeps the user's name, merges settings by key and preserves bindings whose slot key and kind are unchanged. Missing required bindings must be supplied or the update fails.
- Warn before updating locally modified code; copies continue working if the source becomes private or is deleted.

**Dependencies:** ST-010.

**Relevant existing architecture:** No notification model or version tables exist today. B-007 adds them once; copies reuse the same model, sandbox, slots and owner-scoped transaction service.

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

**Delivery:** Batch B-008, together with ST-013, in one PR. Statements and status, payments and their accounting, and reminders are built in that order inside it. The accounting mechanism is settled before the batch starts, because it shapes statement storage.

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

**Delivery:** Batch B-009, together with ST-016, in one PR. Holdings and manual valuations come first, then aggregate value and net-worth integration.

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

**Delivery:** Batch B-012, in one PR. Secure credential storage with connect and revoke is built first, and ST-020 reuses it. Quantity sync follows.

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

**Dependencies:** ST-001's UTC execution instant (B-001), and ST-007 (B-004), so transaction form changes happen in one place. ST-014 and ST-015 depend on this intent.

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

### ST-024: Group overview and Group Form View

**Objective:** Groups are browsed in a clean, responsive, card-based overview (Kanban-like), and each Group opens in its own dedicated view built on the shared Form View (members and categories as `RelatedList` sections), instead of showing the list and detail side by side.

**Scope:** Replace the simultaneous list and detail with a card overview of Groups. Clicking a Group navigates to its dedicated detail/form view, composed from ST-005, and the overview is no longer visible beside it. Moving between the two is one step each way. Resolve the modal stacking, dropdown layering, and overflow problems of the current layout, including `docs/KNOWN_ISSUES.md` #028 (filter modal stacking and overlapping fields). Group management, members, categories, permissions, summary, and transactions keep their behavior. No other form system is introduced.

**Acceptance criteria:**
- The overview shows Groups as responsive cards, usable from mobile to desktop width.
- Clicking a Group opens its detail view at a linkable URL, and the overview is not shown beside it.
- A clear control returns to the overview, and the browser back button does the same.
- The Group detail view uses the shared Form View with no Group-specific copy of its lifecycle, and its members and categories sections use `RelatedList` in immediate mode.
- Members appear by public identity (`Name (@username)` or `@username`), never by email, and the member-add search uses username search (ST-003). The view does not widen access: shared-expense participants who are not members never see Group data.
- Filter modals and dropdowns appear above all page content on both views, and nothing is clipped, which closes #028.
- Create, edit, archive, members, categories, roles, summary, and transactions work as before, and only members can open a Group.
- Existing `?groupId=` links keep working.
- Covered by tests.

**Dependencies:** ST-005.

**Delivery:** Batch B-004, implemented after ST-005, ST-006, ST-007, and ST-003, and before ST-008.

**Relevant existing architecture:** `/groups` is the only Group route (`main.tsx`), and no detail route exists. `GroupsPage.tsx` keeps `selectedGroupId` in state and renders `GroupCreateCard` and `GroupsListCard` beside a detail `Card` in an `xl` two-column grid, with the list column `xl:sticky`. `?groupId=` selects a Group (used by notification targets). Detail sections are `GroupHeader`, `GroupMembersSection`, `GroupCategoriesSection`, `GroupSummarySection`, and `GroupTransactionsSection`. Editing is handled by `useGroupManagement` and `useGroupCategoryManagement`, not by a shared form.

**Open questions:**
- Which parts of a Group are direct-edit fields, and which stay separate actions, such as members and categories?
- Does the overview show a summary on each card, and what does it do with archived Groups?
- Does `?groupId=` redirect to the new detail route, or stay supported as is?

### Security hardening initiative (ST-025 to ST-031)

**Objective:** Fix verified weaknesses in authentication, identity, data isolation, entry routing, and deployment before product work resumes at B-004. Findings came from a read-only audit of production `main` (`9d57822`) and `flowledger_landing` (`efdfc72`) on 2026-11-07. Each intent's evidence, design, and acceptance criteria live in its OpenSpec change.

| Intent | OpenSpec change | Batch |
|---|---|---|
| ST-025 | `fix-access-token-purpose-validation` | S-001 |
| ST-026 | `harden-account-identity-and-sessions` | S-002 |
| ST-027 | `enforce-financial-data-isolation` | S-003 |
| ST-028 | `route-authenticated-root-and-remove-oauth-url-token` | S-004 |
| ST-029 | `harden-api-and-deployment-config` | S-005 |
| ST-030 | `remove-legacy-access-token-storage` | S-006 |
| ST-031 | `enforce-app-content-security-policy` | S-007 |

**Acceptance criteria:** Every requirement and scenario in the change's specs is met, tests pass, and the change's deployment verification is recorded.

**Dependencies:** ST-025 first. ST-026 to ST-029 depend on it only for sequencing; ST-029's owner actions on Cloudflare, GitHub, and the host can begin at any time.

**Delivery:** Batches S-001 to S-005, each independently deployable. S-001 reaches `main` as soon as it's approved, without waiting for anything else.

**Status:** ST-025 to ST-029 deployed to production on 2026-11-07. ST-030 deployed on 2026-11-09: browsers from before 2026-08-10 kept an expired, audience-less access JWT in `localStorage["flowledger.token"]`, and the app now removes it on load. ST-031 deployed on 2026-11-09: application pages enforce a script-restricting CSP (PRs #35 and #37). Owner follow-ups are in `docs/KNOWN_ISSUES.md` #046.

## Implementation Batches / PR Execution Plan

This plan is the authoritative execution order. A batch is a set of closely related intents delivered together in one cohesive pull request; an intent stays an independent requirement with its own scope and criteria, and belongs to exactly one batch. The plan is strictly sequential: **a batch doesn't start until the previous one is completed, tested, reviewed, approved, merged, and closed.** Nothing has been started, so every batch is `Planned`.

| Batch | Intent(s), in implementation order | Objective | Dependencies | Estimated Size | Status |
|---|---|---|---|---|---|
| B-001 | ST-001 | Enter, show, filter, group, and report transaction date and time in the client's timezone | None | L | Completed |
| B-002 | ST-004, ST-002 | Neutral charcoal dark theme, and persistent login on trusted devices | None | M | Completed |
| S-001 | ST-025 | Accept only access-purpose tokens with a real subject on authenticated routes | None | S | Complete |
| S-002 | ST-026 | Stop linking Google by email, re-authenticate email changes, and add rate limits, replay response, and a host-only refresh cookie | S-001 | L | Complete |
| S-003 | ST-027 | Narrow participant data, align user search, and add a cross-user isolation test suite | S-001 | M | Complete |
| S-004 | ST-028 | Show signed-in users their dashboard at `/` and remove the access token from the Google callback | S-001 | S | Complete |
| S-005 | ST-029 | Edge HTTPS, security headers, loopback binding, fail-closed webhooks, safe logs, and dependency updates | S-001 | M | Complete |
| S-006 | ST-030 | Delete the pre-August `flowledger.token` localStorage entry on load; the access token stays in memory only | None | S | Complete |
| S-007 | ST-031 | Enforce a script-restricting CSP on application pages; no auth changes | None | S | Complete |
| B-003 | None | Retired; ST-003 moved into B-004 and ST-009 was deferred to the Odoo Flowledger project backlog | None | n/a | Retired |
| B-004 | ST-005, ST-006, ST-007, ST-003, ST-024, ST-008 | Odoo-inspired directly-editable Form View with tabs and `RelatedList`, Profile, then Account, Transaction (with prefilled drafts, Details/Sharing/Related tabs, atomic save), convert and edit shared transactions with participant consent, blocking, public usernames and universal invitations (one migration, owned by ST-003), Group views with card overview, and Financial overview counting accepted shares only, all in one PR | S-001 to S-005 (sequencing only) | XL (grew with consent, blocking, and public identity) | Completed (PR #40, deployed 2026-11-12; also shipped: Form View tabs General/Transactions, Group category cards and create modal, server-side pagination through `createSieve`, immutable settled allocations with extra allocation lines, MCP OAuth for Meta AI Muse (hosted client document) and Grok, and per-client AI connection guide) |
| B-005 | None | Retired; ST-008 was absorbed into B-004 | None | n/a | Retired |
| B-006 | ST-023 | Correct native balances with auditable FX history and crypto precision | B-001, B-004 | L | Completed (PR #44, deployed 2026-11-12. Also shipped: a unified `Decimal(38,18)` money model with exact decimal-string API/MCP contracts; crypto Sharing and settlements with exact largest-remainder splits; per-currency group summaries; the account currency lock (#013); and the `TransactionCorrection` audit. Production kept its 24 transactions via the idempotent fill.) |
| B-007 | ST-010, ST-011, ST-032 | Notification processing models: sandboxed Python, async per-model ingest endpoint, and community library | B-004 | XL | Planned |
| B-008 | ST-013, ST-014 | Credit-card limit, available credit, statements, payments with their accounting, and reminders | B-004, B-006 | XL | Planned |
| B-009 | ST-015, ST-016 | Manual holdings and valuations with net-worth integration, then automatic crypto prices | B-004, B-006 | L | Planned |
| B-010 | ST-021, ST-022 | Instrument catalog: public securities and custom assets | B-009 | L | Planned |
| B-011 | ST-017 | Stock and ETF market data | B-010 | M | Planned |
| B-012 | ST-018 | Binance read-only account sync, with secure credential storage | B-009 | L | Planned |
| B-013 | ST-019 | On-chain wallet sync | B-009 | M | Planned |
| B-014 | ST-020 | User-configured external sync | B-009, B-012 | L | Planned |

Sizes are relative engineering estimates, not time commitments; XL is deliberately larger than L, and B-004, B-007 and B-008 are the three XL batches. **Execution order and technical dependencies are distinct:** the order above applies to every batch, while the Dependencies column lists only real technical prerequisites. B-003 and B-005 are retired and are not renumbered or reused. B-007 is sequenced after B-006 by product priority, not by dependency: its only technical prerequisite is B-004, and no later batch depends on it.

**Where to start:** B-007 is next. B-001, B-002, B-004, B-006, and S-001 to S-005 are complete.

**Milestone: notification ingestion before advanced financial features.** The goal is a stable, production-usable FlowLedger after B-006, then mobile-notification ingestion. Completing B-007 should provide an end-to-end usable workflow for automatically submitting supported mobile notification content to FlowLedger and reviewing the resulting transactions. Only after B-007 do the advanced financial features begin: credit cards, holdings, valuations, and external integrations (B-008 onward). Merging into `razs_ai` does not release anything, so after B-007 the product owner has an explicit opportunity to evaluate a production release (merging `razs_ai` into `main` and deploying) before B-008 starts.

**Execution rule:** Batches run strictly one at a time, and each receives explicit approval before implementation begins.

**Split intents:** None. Every intent ships inside exactly one batch and is complete when that batch merges. Where an intent has several internal steps or migrations (ST-014, ST-015, ST-018), they are ordered inside its one PR.

**Grouping decisions:**

| Candidate grouping | Decision | Reason |
|---|---|---|
| ST-010 + ST-011 + ST-032 | Merged (B-007) | One end-to-end feature; the library reuses the model, sandbox and slot design, and shipping the data model once avoids a second migration of the same tables; implemented in ordered phases inside the PR |
| ST-013 + ST-014 | Merged (B-008) | One credit-card feature; the limit and the statement view live on the same account section, and ST-014's three former parts are one reviewable flow |
| ST-015 + ST-016 | Merged (B-009) | Manual crypto portfolios are ST-015's first complete use, and ST-016 prices exactly those holdings with no new provider |
| ST-008 with ST-015 | Kept separate (B-004, B-009) | ST-023 removes ST-008's temporary cross-currency disclosure, so ST-008 must ship before ST-023, while ST-015 needs ST-023 |
| ST-021 + ST-022 | Merged (B-010) | Both create the instrument record that ST-015 left open and a form view over it, so one model decision covers both |
| ST-017 | Kept separate (B-011) | A provider and licensing no-go must not block the catalog, which works without it |
| ST-018 + ST-019 | Kept separate (B-012, B-013) | ST-018 stores secrets and has a host-reachability check; ST-019 has no secrets and is kept distinct from exchange integrations, so neither blocks the other |
| ST-020 | Kept separate (B-014) | Conditional go/no-go and first user-controlled outbound request (SSRF) |
| ST-023 | Kept separate (B-006) | Financial correctness with a destructive-reset approval; bundling it would hide it in a larger review |
| ST-002, ST-004 | Bundled (B-002) | Both are small, non-financial, user-level settings; ST-004 lands first so later UI inherits the palette |
| ST-003 with ST-007 | Bundled (B-004) | ST-003 extends the transaction editing lifecycle that ST-007 builds, so they ship together but are specified as separate changes; ST-007 owns create-time sharing and the atomic save contract, ST-003 owns existing-transaction conversion, consent, blocking, and public identity (and B-004's one migration) |
| ST-008 with ST-005 | Bundled (B-004) | ST-008 integrates into Profile, which ST-005 migrates; it is read-only and has no form-state dependency; it counts only accepted shares (ST-003) |

**Large batches kept whole:**

- **B-007:** Phases in order: data model, config and shared contracts, sandbox runner, model API, persistent queue + ingestion + worker, web UI (five tabs), library, docs and staging acceptance.
- **B-004:** ST-005, ST-006, ST-007, ST-003, ST-024, and ST-008 stay six independent intents, each with its own OpenSpec change, scope, and criteria, but by deliberate product-owner decision they ship as one larger feature branch and one PR targeting `razs_ai` that is **not to be split** into phases, parts, or optional follow-ups. Implementation order within the PR: ST-005 first as the shared foundation (with Profile as proof of no behavior loss), then ST-006, then ST-007 and ST-003 (separately specified; ST-003 extends ST-007's editing lifecycle), then ST-024, then ST-008. The batch grew in scope (participant consent, user blocking, public usernames and privacy, one migration) but stays XL and unsplit.
- **B-006:** Splitting it would merge balances that disagree with their recorded execution details. **It is the largest L batch and sits at the top of the L range:** it combines FX persistence, an API number-to-string contract change, and correction history across four write paths. Its proposal should confirm that it fits one reviewable PR. The decimal-string contract is the main size risk.
- **B-008:** Splitting declared payments from recorded transactions would merge a state that can break the no-double-counting invariant, so ST-014 is not split. The batch is XL because it holds ST-013 plus the statements, payments, and reminders of ST-014 in one PR. Its proposal should confirm the fit and may order the work internally as limit, statements, payments, then reminders. Reviewers should treat the payment accounting as the focus.
- **B-009:** The main double-counting risk (holdings against derived balances) is reviewed inside this PR through the net-worth tests, instead of a separate PR.
- **B-012:** ST-018 is not split. Encrypted credential storage is the first commit-level step and needs a security review of encryption and key management before implementation starts, because it is FlowLedger's first readable per-user secret and B-014 reuses it.
- **B-014:** It may be dropped at its go/no-go check. If it goes ahead, discovery should re-evaluate splitting it.

**External feasibility and provider risks:**

| Batch | Check before starting |
|---|---|
| B-007 | None beyond the sandbox runner's own Node 24 runtime checks. |
| B-009 | Whether the USDT-as-USD assumption is accurate enough for displayed crypto valuations |
| B-011 | Provider choice, rate limits, and display and redistribution licensing |
| B-012 | Whether the production host can reach the Binance account API; regional and hosting restrictions may block it. Security review of encryption and key management. |
| B-013 | RPC or indexer provider, and whether a fixed token list is enough |
| B-014 | Whether the need remains after B-009 to B-013 (go/no-go); this is the first user-controlled outbound request |

### Batch details

Unless noted, a batch meets the full acceptance criteria of each of its intents. The completion rules below apply to all of them.

**B-001: ST-001 (Odoo task #129).**
- **Deliverable:** One date-and-time field on the create and edit forms, local display, timestamp-preserving edits, half-open API date ranges, a report `timeZone`, client-local filters with time-of-day selection, grouping, and cashflow buckets, MCP datetime filters, and provider-date display.
- **Prerequisites:** None.
- **Testing:** Independent date and time edits, positive and negative offsets, both DST days, month boundaries, invalid timezones, unchanged timestamps, provider dates, and date-only requests.
- **Done when:** All ST-001 acceptance criteria are met.

**B-002: ST-004, ST-002 (Odoo task #128).**
- **Deliverable:** A central dark palette change, which comes before new UI so later batches inherit it (ST-004); then the login option, the fix for the logout cause found in discovery, revocation on password change, and corrected `CLAUDE.md` wording (ST-002).
- **Implementation order:** ST-004, then ST-002.
- **Prerequisites:** None. The cause of mobile logouts is identified first.
- **Testing:** Visual check of light and dark modes, contrast, charts, and native selects. Session lifetime both ways, logout, password change, and token rotation.
- **Done when:** Dark surfaces have no dominant blue tint and light mode is unchanged, and the session survives reopening on mobile and desktop.

**S-001 to S-005: ST-025 to ST-029.**
- **Deliverable:** The OpenSpec change named for each intent under [Security hardening initiative](#security-hardening-initiative-st-025-to-st-029).
- **Implementation order:** S-001, S-002, S-003, S-004, S-005. Within S-004, API and web deploy before the gateway. Within S-005, owner actions can start at any time.
- **Prerequisites:** S-001 has none. Its branch starts from `origin/main`, so the held planning commit stays out of it.
- **Testing:** As listed in each change's tasks, with synthetic users only. No exploit testing against production.
- **Done when:** Each change's acceptance scenarios pass and its deployment verification is recorded. S-004 also needs the real-device check on an installed iOS app.

**B-003: retired.**
- Historical note: formerly ST-003 and ST-009; ST-003 (Odoo task #127) moved into B-004 and ST-009 was deferred to the Odoo Flowledger project backlog.

**B-004: ST-005, ST-006, ST-007, ST-003, ST-024, ST-008.**
- **Deliverable:** The Odoo-inspired shared Form View (direct editing, header Save/Discard, tabs, `RelatedList`) with Profile migrated onto it (ST-005); an account route and view with clear `checking` labeling (ST-006); the transaction view directly editable with Details, Sharing and Related tabs, create-time sharing, one atomic save, and prefilled new drafts at their own URL (ST-007); converting and editing shared transactions with settlement guards, participant consent (proposed/accepted/rejected), user blocking, public usernames with visibility modes enforced server-side on web, `/v1` and MCP, and universal invitations, with B-004's single Prisma migration (ST-003, Odoo task #127); the Group card overview with a dedicated Group detail view (ST-024); and `GET /reports/financial-overview` with the Financial overview section on Profile counting only accepted shares (ST-008). The batch needs exactly one migration, owned by ST-003, whose backfill SQL requires the owner's explicit approval at apply.
- **Implementation order:** ST-005, then ST-006, then ST-007 and ST-003, then ST-024, then ST-008. ST-005 is the shared foundation the form views consume; ST-003 extends ST-007's editing lifecycle; ST-008 is read-only with no form-state dependency. Each intent has its own OpenSpec change; all six ship in one feature branch and one PR targeting `razs_ai`, by deliberate product-owner decision. It is not to be split.
- **Prerequisites:** None. The rule for unsaved-change protection is decided first.
- **Testing:** Existing Profile scenarios stay valid (click-to-activate selectors rewritten), plus `RelatedList` and header-action tests, plus one non-Profile test consumer. Accounts: ownership, field editing, existing actions, and mobile width. Transactions: coupled-field rules, invalid in-between states, sharing, old edit links, stored times surviving unrelated edits, and nothing created until a draft is saved. Conversion and editing on both layouts, the atomic save and its failure path, transfer rejection, and share limits (ST-003). Consent (only the participant responds, only accepted shares count, re-proposal on material change), settlement guards on every entry point, blocking effects, username rules and generation on both signup paths, public-identity serialization with no email leaks on web, `/v1` and MCP, search limits, universal invitations with no Group data exposed to non-members, and the migration backfill (ST-003). Groups: navigation both ways, `?groupId=` links, member-only access, existing management behavior, and filter modal and dropdown layering at mobile and desktop width. Service tests for each disclosure, missing rates, zero income, settlement neutrality, month selection, user isolation, and exclusion of proposed and rejected shares (ST-008).
- **Done when:** All criteria of ST-005, ST-006, ST-007, ST-003, ST-024, and ST-008 are met, #028 is resolved, a converted transaction appears as shared in the list and, once accepted, in debts, consent and blocking work, no endpoint or UI exposes another user's email, the single migration is applied with the owner's approval of its backfill, and both metrics show correctly labeled figures where a failure in one leaves the other metric and Profile working.

**B-005: retired.**
- Historical note: formerly ST-008; absorbed into B-004. The temporary cross-currency disclosure still precedes B-006, so it exists to be removed.

**B-006: ST-023.**
- **Deliverable:** Persisted applied amounts and execution details for cross-currency records, correct native balances, suggested and correctable rates and received amounts, `Decimal(30,18)` native crypto amounts with exact arithmetic, the `TransactionCorrection` history, and the form changes they need.
- **Prerequisites:** B-001 and B-004. The proposal documents any reset, and the exact operation is separately approved before execution.
- **Testing:** Balance calculation across currency combinations, rate changes leaving balances and history untouched, net-only versus explicit-fee records, an 18-decimal round trip, fiat behaving as before, correction rows, every write path, and no change for same-currency records.
- **Done when:** Native balances are exact and correct, each cross-currency record has an auditable history, and every financial correction records who changed what and when.

**B-007: ST-010, ST-011, ST-032.**
- **Deliverable:** User-owned sandboxed Python models with slots and bindings, list and five-tab Form View (Form, Code, Playground, Queue, Logs); an ingest-only key, a JSON-only async per-model endpoint, a persistent per-model queue with configurable concurrency, fairness and a separate PM2-supervised worker process from the same codebase; community publishing, installation and optional version updates.
- **Implementation order:** Data model, config and shared contracts, sandbox runner, model API, persistent queue + ingestion + worker, web UI (five tabs), library, docs and staging acceptance.
- **Prerequisites:** B-004 is the only technical batch dependency. Before the first production deploy, the owner registers the PM2 worker from `~/production/flowledger/apps/api` using `pm2 start npm --name flowledger-prod-worker --kill-timeout 15000 --exp-backoff-restart-delay 1000 -- run start:worker`, then `pm2 save`, and adds `pm2 restart flowledger-prod-worker --update-env` after the API restart in external `~/scripts/deploy-flowledger-prod.sh`. Deployment order stays migrate → build → API → worker. The architecture decision in the [OpenSpec design](openspec/changes/b007-notification-processor/design.md) is a separate worker process from the same `apps/api` codebase, sharing only Postgres, with no `apps/engine`, new service, repository, database or worker-specific dependency. More workers means more `dist/worker.js` processes; Lambda later swaps only the sandbox execution body, with no AWS now.
- **Testing:** Malicious-script suite (imports, dunder/frame access, `str.format` traversal, infinite loop, memory bomb, ReDoS), activation, side-effect-free tests, cross-user isolation (add rows to `financialIsolation.integration.test.ts`), duplicates, inactive models, missing mappings, queue saturation, concurrency limits and misconfigured env, fairness, persistence failure (503), worker stop/kill/restart isolation (API stays available, ingests return 202, queued runs survive and drain after startup), multi-worker concurrency, worker health check (503 with no worker seen within 60 s, 200 with live count), unmigrated-schema startup refusal, crashed in-flight runs (`worker_lost` after worker liveness is stale more than 2 minutes), graceful shutdown, retention (7/30 days), and no text or credentials in logs. Library installation, immutable versions, settings merge, binding preservation and local-modification warnings.
- **Done when:** A posted notification creates exactly one correct transaction, a promotion is skipped, and a copy installed from the library works with the installer's own mappings.

**B-008: ST-013, ST-014.**
- **Deliverable:** The credit limit, derived available credit, and the debit-card inference fix (ST-013); statements with dates, amount, and status; the partial and full payment flow, the modal, optional transaction creation through a draft, the chosen accounting mechanism, and outstanding and overdue highlighting; and in-app reminders delivered once per statement (ST-014).
- **Implementation order:** ST-013, then ST-014 (statements, then payments, then reminders). Outstanding and overdue highlighting ships with payments so it raises no false alarms, and a fully paid statement gets no reminder.
- **Prerequisites:** B-004 (account view, and prefilled transaction drafts) and B-006. The accounting mechanism and statement storage are decided first.
- **Testing:** Over-limit, overpaid, and no-limit cards, plus type inference. Cycle boundaries, short months, and a new cycle starting unpaid. The $30,000/$10,000/$2,000/$12,000/$6,000 scenario, multiple partial payments, later matching, linked edits and deletes, and net worth. Reminder restarts, repeated scheduler runs, and paid statements.
- **Done when:** Limit, outstanding balance, and available credit show on the account view, every balance change from a payment traces to one record and never applies twice, and all ST-014 criteria are met.

**B-009: ST-015, ST-016.**
- **Deliverable:** Holdings and manual valuations on the account view, with manual crypto portfolios as the first use, aggregate account value, and holdings in the existing net-worth calculation (ST-015); market values on crypto holdings, with manual overrides taking priority (ST-016).
- **Implementation order:** ST-015 (holdings, then aggregate value and net worth), then ST-016.
- **Prerequisites:** B-004 and B-006. The instrument reference and the relationship between holdings and balance are decided first. The USDT-as-USD accuracy check.
- **Testing:** Multiple holdings, the same instrument across accounts, stale values, ownership, no double counting in net worth, removal of the `investment` disclosure for accounts with holdings, override priority, unsupported assets, and unavailable prices never showing zero.
- **Done when:** Users can maintain positions, there is one net-worth calculation and it includes holdings, and a supported crypto holding shows a timestamped market value.

**B-010: ST-021, ST-022.**
- **Deliverable:** One securities model, search-select-create when adding a holding, and a security form view (ST-021); custom asset records in a form view, holdable in eligible accounts (ST-022).
- **Implementation order:** ST-021, then ST-022, reusing the instrument record decided in B-009.
- **Prerequisites:** B-009. The ownership model for securities is decided first.
- **Testing:** Two positions in one security, the same ticker on different exchanges, user isolation, manual valuation, stale marking, and net-worth inclusion.
- **Done when:** Securities work fully without a market-data provider, and a custom asset counts toward account value and net worth.

**B-011: ST-017.**
- **Deliverable:** One provider's optional prices for catalog securities.
- **Prerequisites:** B-010 and the provider and licensing check.
- **Testing:** Provider failure, rate limits, delayed labels, and override priority.
- **Done when:** Supported holdings show sourced prices, and failures leave the last value visible as stale.

**B-012: ST-018.**
- **Deliverable:** Encrypted per-user credentials, plus connect, read-only verification, and revoke; then quantity sync into holdings through `FinancialProviderAdapter`, with sync status.
- **Implementation order:** Credential storage first, then sync.
- **Prerequisites:** B-009, the host reachability check, and a security review of encryption and key management.
- **Testing:** Secrets absent from responses and logs, rejected trading keys, removal on disconnect, refresh, failures keeping the last quantities, and manual overrides.
- **Done when:** A user can connect and revoke a verified read-only key, and all ST-018 criteria are met.

**B-013: ST-019.**
- **Deliverable:** Public-address balances for a limited set of chains, read into holdings.
- **Prerequisites:** B-009 and the provider and chain decisions.
- **Testing:** No key or signature requests, unsupported assets, and failed syncs.
- **Done when:** A pasted public address produces holdings that refresh by sync.

**B-014: ST-020.**
- **Deliverable:** Configurable outbound sources with SSRF protection, if the go/no-go check confirms the need.
- **Prerequisites:** B-009, B-012, and the go/no-go check.
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
Independent   ST-001   ST-002   ST-004   ST-008

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
         +--> ST-024
         |
         +--> ST-010 --+--> ST-011
                       +--> ST-032

ST-001 --> ST-023 (execution instant and shared date helper)
ST-023 --> ST-015 (exact crypto quantities)
ST-008 --> ST-015 (net-worth integration only)
ST-007 --> ST-003 (ST-003 extends ST-007's editing lifecycle)
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
- Encryption, key management, and rotation for readable secrets.

**SSRF (ST-020)**
- A starting checklist is in the [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html): HTTPS only, validate all resolved addresses, pin the validated IP, disable or re-validate redirects, and limit time and response size.
