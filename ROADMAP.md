# FlowLedger Roadmap

## Product Vision

FlowLedger is a web-first personal finance platform that allows users to manage all their financial activity from a single place.

The long-term vision is to become a unified financial operating system that aggregates:

- Bank accounts
- Credit cards
- Cash accounts
- Shared expenses
- Debts
- Investments
- Crypto accounts
- Financial reports
- AI-powered financial insights

FlowLedger prioritizes:

1. Security
2. Data ownership
3. Automation
4. Simplicity
5. Financial visibility

---

# Product Principles

FlowLedger should:

- Work well for individuals.
- Work well for families and groups.
- Reduce manual bookkeeping.
- Automate financial aggregation whenever possible.
- Remain provider-agnostic.
- Support future expansion without major rewrites.

The architecture must avoid vendor lock-in.

No financial provider should become a hard dependency of the platform.

---

# Current Architecture

FlowLedger is an npm workspaces monorepo.

## Backend

Location:

apps/api

Technology:

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- JWT Authentication
- Zod Validation

## Frontend

Location:

apps/web

Technology:

- React
- Vite
- TypeScript
- Tailwind CSS
- TanStack Query
- Recharts

## Shared Package

Location:

packages/shared

Contains:

- Shared schemas
- Shared DTOs
- Shared types
- Shared constants

## Database

Location:

database

Technology:

- PostgreSQL
- Prisma ORM

---

# Current Product Capabilities

## Authentication

Implemented:

- Email/password authentication
- JWT sessions
- Google OAuth

## Accounts

Implemented:

- Manual accounts
- Provider accounts
- Account balances
- Account archiving

## Categories

Implemented:

- Personal categories
- Group categories
- Category archiving

## Groups

Implemented:

- Group creation
- Group membership
- Shared categories
- Shared expenses

Groups replace the original Household concept.

## Transactions

Implemented:

- Income
- Expense
- Transfer
- Imported transactions
- Transaction relationships

## Shared Expenses

Implemented:

- Shared expense creation
- Participant tracking
- Settlement workflows

## Debts

Implemented:

- I Owe
- Owed To Me
- Pending Settlement Requests
- Settled Debts

## Notifications

Implemented:

- Settlement notifications
- Imported transaction notifications

## Reports

Implemented:

- Dashboard summaries
- Category reports
- Monthly cashflow reports

---

# Provider Platform Vision

Provider integrations are a core strategic capability.

FlowLedger must support multiple providers through a unified provider architecture.

Examples:

- Syncfy
- Belvo
- Plaid
- MX
- Open Banking APIs
- Crypto exchanges

The application must never hardcode business logic directly into a single provider implementation.

Provider integrations must remain interchangeable.

---

# Current Provider Architecture

Implemented:

- Provider registry
- Provider adapters
- Generic provider routes
- Generic webhook ingestion
- Imported transaction pipeline
- Provider accounts
- Provider connections
- Provider webhook audit logs

Current provider:

- Syncfy

---

# Syncfy Integration

Implemented:

## User Lifecycle

- Create Syncfy user
- Reuse existing Syncfy user
- Syncfy user mapping

## Connection Lifecycle

- Widget-based connection flow
- Session creation
- Provider connection storage

## Data Import

- Account import
- Transaction import
- Imported transaction review workflow

## Webhooks

Implemented:

- Raw payload storage
- Event deduplication
- Audit trail
- HMAC signature validation
- Event processing pipeline

Production Syncfy event ingestion is consolidated on the generic provider
webhook route `/providers/webhooks/syncfy`. The legacy `/syncfy/webhook` route
is deprecated and does not process provider events.

---

# Current Development Focus

Status: ACTIVE

Milestone 5 (Syncfy Auto-Sync) is complete. The `SyncfyAutoSyncScheduler` is
implemented, started on API boot, and handles reconnect detection, per-job
timeouts, configurable concurrency, and overlap prevention.

Current focus is Milestone 6: Unignore Imported Transactions — a small,
self-contained fix that unblocks users who accidentally ignored transactions
they want to revisit.

After Milestone 6, the priority is the Full Currency Logic group (Milestones
7-10), which must land before any feature that displays or computes monetary
amounts, including the crypto integration group that follows.

---

# Milestone 4 - Provider Architecture Foundation

Status: COMPLETED

Completed:

- Generic provider architecture
- Syncfy provider implementation
- Provider account model
- Provider transaction model
- Imported transaction review workflow
- Webhook processing pipeline
- Webhook signature verification

---

# Milestone 5 - Syncfy Auto Synchronization

Status: COMPLETED

Completed:

## Connection Health Tracking

- `ProviderConnection.status` tracks `active`, `sync_failed`, `reconnect_required`
- `requiresManualReconnect` flag removes connections from auto-sync queue

## Syncfy Refresh Metadata

- Sanitized endpoint paths stored in `ProviderConnection.rawData.syncfyRefreshMetadata`
- Sensitive query params (`token`, `api_key`, `username`, `password`, `otp`, etc.) stripped before storage
- `id_credential` is the credential source of truth — bank login credentials never stored

## Manual Resync and Reconnect

- `POST /providers/syncfy/credentials/:providerCredentialId/refresh` handles both resync and reconnect
- Widget entrypoints: `setEntrypointCredential` (resync) / `setEntrypointUpdateCredential` (reconnect)
- Bounded backend retry/backoff (`[0, 5000, 15000, 30000]` ms) after widget completion

## Automated Synchronization

- `SyncfyAutoSyncScheduler` started on API boot
- Configurable: `SYNCFY_AUTO_SYNC_ENABLED`, `SYNCFY_AUTO_SYNC_INTERVAL_MINUTES`,
  `SYNCFY_AUTO_SYNC_JOB_TIMEOUT_MS`, `SYNCFY_AUTO_SYNC_CONCURRENCY`
- Processes oldest-synced connections first; skips overlap; isolates per-job failures

## Dynamic Token / MFA Handling

- `shouldMarkSyncfyManualReconnect()` detects MFA/OTP/auth error patterns
- Automatically marks connection `requiresManualReconnect = true` and removes from auto-sync queue

---

# Milestone 6 - Unignore Imported Transactions

Status: COMPLETED

Imported transactions can currently move from `pending` to `ignored`, but not
back. Add a button to move an imported transaction from `ignored` back to
`pending`, so the user can revisit a previously ignored transaction and decide
whether to process it into a real `Transaction` or ignore it again.

Goals:

- "Unignore" action on imported transactions (single and, ideally, batch)
- Imported transaction status transition: `ignored` → `pending`
- No change to the existing `pending` → `ignored` flow

---

# Milestone Group: Full Currency Logic

The platform currently has no real multi-currency support — only
`ProviderImportedTransaction` stores a raw `currency` string from the provider,
and it is not used for conversion or display. Milestones 7-10 introduce
end-to-end currency handling: a user-level display currency, per-account native
currency, per-transaction execution currency with exchange rate capture, and
currency-aware debts.

**This group must ship before any feature that displays or computes monetary
amounts, including the crypto integration group (Milestones 11-15).** Each
milestone in this group builds on the previous one and they must ship in order.

---

# Milestone 7 - User Currency Preference

Status: PLANNED

Add a currency selector to the user profile settings so each user can set their
preferred display currency.

Goals:

- Currency field on the user profile
- Currency selector in profile settings UI
- Preferred currency becomes the basis for all converted-amount displays used
  by later milestones in this group

---

# Milestone 8 - Native Currency on Accounts

Status: PLANNED

Depends on: Milestone 7.

Each account has a native currency. All amounts must be translated and displayed
in the user's preferred currency.

Goals:

- Native currency field on accounts (manual and provider accounts)
- Conversion of account balances from native currency to the user's preferred
  currency for display
- No change to how balances are stored — conversion happens at
  display/calculation time, not at write time

---

# Milestone 9 - Transaction Execution Currency + Exchange Rate

Status: PLANNED

Depends on: Milestones 7 and 8.

Every transaction must store:

- The currency in which it was executed (which may differ from both the account
  currency and the user's preferred currency)
- The exchange rate at the time of execution (fetched from Google)
- The amount expressed in the user's preferred currency

Goals:

- Execution currency field on `Transaction`
- Exchange rate capture at transaction creation time, sourced from Google
- Persisted user-preferred-currency amount, computed once at execution time and
  never recalculated retroactively

---

# Milestone 10 - Multi-Currency Debts

Status: PLANNED

Depends on: Milestone 9.

Debts must be denominated in the currency of the original transaction. If a
debt is paid in a different currency, the amount owed in the original
transaction currency is what governs — exchange rate fluctuations between debt
creation and settlement are the payer's responsibility.

Example: a $20 USD debt created one month ago must be repaid at the equivalent
of $20 USD at today's rate, regardless of currency movements since the debt was
created.

Goals:

- Debts inherit and store the originating transaction's execution currency
- Settlement conversion uses the exchange rate at settlement time, applied to
  the original transaction-currency amount
- No retroactive re-denomination of existing debts when exchange rates move

---

# Milestone Group: Full Crypto Adaptation

Milestones 11-15 turn the high-level crypto vision into a concrete
implementation plan. They depend on the Full Currency Logic group (Milestones
7-10) being complete, since crypto balances are denominated in currencies that
must flow through the same currency model.

---

# Milestone 11 - Binance API Integration

Status: PLANNED

Depends on: Milestone 10 (Full Currency Logic complete).

Enable connection to crypto accounts starting with the Binance API, so users
can link their Binance account and track balances from within FlowLedger.

Goals:

- Binance API provider integration, following the existing
  `FinancialProviderAdapter` pattern
- Read-only balance retrieval (no trading, no withdrawal capability)
- No Binance credentials or API secrets stored beyond what is required to
  maintain the connection, consistent with FlowLedger's no-bank-credential
  policy

---

# Milestone 12 - Crypto Wallet Accounts and Crypto Balances Table

Status: PLANNED

Depends on: Milestone 11.

Crypto wallet accounts follow the same account model as regular accounts (they
have a defined display currency, e.g. USD or MXN), but they are linked to a
new `crypto_balances` table holding the individual token balances within a
crypto wallet account.

`crypto_balances` columns:

- `id`
- `amount`
- `currency_id` — many-to-one relation to a `currencies` table
- `account_id` — many-to-one relation to the `accounts` table

Goals:

- `currencies` table (covers both fiat and crypto assets used elsewhere in the
  currency group)
- `crypto_balances` table as described above
- Crypto wallet accounts modeled as regular accounts with one or more associated
  `crypto_balances` rows

---

# Milestone 13 - Account Balance in Account Currency and User Currency

Status: PLANNED

Depends on: Milestones 7, 8, and 12.

All accounts must display their balance both in the account's native currency
and in the user's preferred currency, including crypto wallet accounts whose
balance is the sum of their `crypto_balances` rows.

Goals:

- Dual-currency balance display (native + user-preferred) for every account type
- Crypto wallet account balance computed as the converted sum of its
  `crypto_balances`

---

# Milestone 14 - Exchange Rates: Live Only, Never Stored on Accounts

Status: PLANNED

Cross-cutting constraint for the entire currency and crypto group, most relevant
to Milestones 9, 12, and 13.

Accounts must never store exchange rates. The only entity that stores an
exchange rate is the transactions table, because transactions represent
definitive operations at a point in time. All other balance calculations
(account totals, crypto balances, etc.) must derive exchange rates dynamically:

- From Binance for crypto assets
- From Google for fiat currencies

Goals:

- No exchange-rate fields on `Account` or `crypto_balances`
- Dynamic, on-demand exchange rate lookups for all non-transactional balance
  calculations
- `Transaction.exchangeRate` (Milestone 9) remains the only persisted exchange
  rate in the system

---

# Milestone 15 - Investments

Status: PLANNED

Depends on: Full Currency Logic group complete.

Goals:

- Investment accounts
- Portfolio tracking
- Performance reporting
- Asset allocation reporting

---

# Milestone 16 - Financial Automation

Status: PLANNED

Goals:

- Automatic transaction categorization
- Categorization rules
- Recurring transaction detection
- Merchant recognition
- Duplicate detection

---

# Milestone 17 - Budgeting

Status: PLANNED

Goals:

- Monthly budgets
- Category budgets
- Savings goals
- Budget alerts
- Forecasting

---

# Milestone 18 - AI Financial Assistant

Status: PLANNED

Goals:

- Spending insights
- Budget recommendations
- Cashflow forecasting
- Financial anomaly detection
- Personalized financial recommendations

AI features must operate on user-authorized financial data only.

---

# Milestone 19 - Mobile Applications

Status: PLANNED

Goals:

- iOS application
- Android application
- Shared API backend
- Push notifications

---

# Milestone 20 - SaaS Platform

Status: PLANNED

Goals:

- Subscription plans
- Premium integrations
- Premium reporting
- AI subscription features
- Multi-tier account management

Only pursue monetization after the platform reaches maturity and reliability
targets.

---

# Success Criteria

FlowLedger succeeds when a user can:

- Connect financial accounts.
- Keep accounts synchronized automatically.
- Track spending with minimal manual work.
- Manage debts and shared expenses.
- Understand their financial position in real time.
- Receive actionable financial insights.

All while maintaining strong security, privacy, and ownership of financial data.