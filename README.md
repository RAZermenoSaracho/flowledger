# FlowLedger

FlowLedger is a web-first personal finance platform that helps users aggregate, organize, and understand their financial activity from a single dashboard.

The platform supports:

- Personal finance management
- Shared expenses
- Debt tracking
- Bank integrations
- Automated transaction imports
- Financial reporting

The long-term goal is to become a unified financial operating system for individuals, families, and small groups.

---

# Architecture

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

Responsibilities:

- Authentication
- User management
- Financial domain logic
- Provider integrations
- Transaction imports
- Reporting
- Notification workflows

---

## Frontend

Location:

apps/web

Technology:

- React
- Vite
- TypeScript
- Tailwind CSS
- TanStack Query
- React Router
- Recharts

Responsibilities:

- User interface
- Account management
- Transaction management
- Provider connection flows
- Imported transaction review
- Reports and dashboards

---

## Shared Package

Location:

packages/shared

Contains:

- Shared TypeScript types
- Shared constants
- Shared API contracts
- Shared Zod schemas

Both backend and frontend should consume shared contracts whenever possible.

---

## Database

Location:

database

Technology:

- PostgreSQL
- Prisma ORM

Database responsibilities:

- User data
- Accounts
- Categories
- Transactions
- Shared expenses
- Debts
- Notifications
- Provider integrations
- Imported transaction storage

---

# Current Features

FlowLedger currently supports authentication (email/password + Google OAuth), manual and provider-linked accounts, personal and group categories, groups (replacing the original "Household" model — all new development must use Group terminology), income/expense/transfer transactions with an imported-transaction review workflow, shared expenses with settlement workflows, per-person debt balances, summary/category/monthly-cashflow reports, and in-app notifications.

For the authoritative, up-to-date feature-by-feature status (including what's planned next), see `ROADMAP.md` — this section intentionally doesn't duplicate that list.

---

# Provider Platform

Provider integrations are implemented through a provider abstraction layer.

Current provider:

- Syncfy

Future providers may include:

- Belvo
- Plaid
- MX
- Open Banking providers
- Crypto exchanges

Provider implementations must remain interchangeable.

Do not create provider-specific parallel systems.

All new integrations should extend the existing provider architecture.

---

# Provider Architecture

The generic provider abstraction (adapter contract, registry, generic `/providers/*` and `/providers/webhooks/*` routes) lives on the `accounts` module, since account-provider syncing is what it exists for — not in a standalone `providers` module:

apps/api/src/modules/accounts

Important files:

- types/provider.types.ts
- utils/providerRegistry.ts
- services/providerConnections.\*.ts
- services/providerWebhooks.service.ts

Current Syncfy implementation (`accounts/providers/syncfy/`):

- syncfy.adapter.ts
- syncfy.client.ts
- syncfy.webhookSecurity.ts
- syncfyAutoSyncScheduler.ts
- services/ (create/read/update split)

---

# Syncfy Integration

Implemented capabilities:

## User Lifecycle

- Create Syncfy users
- Reuse existing Syncfy users
- User mapping between FlowLedger and Syncfy

## Connection Lifecycle

- Widget-based connection flow
- Session creation
- Provider connection storage

## Import Pipeline

- Account import
- Transaction import
- Imported transaction review workflow

## Webhooks

Implemented:

- Raw payload storage
- Event deduplication
- Audit trail
- Signature validation
- Processing pipeline

Production Syncfy webhooks are processed only at:

- `/providers/webhooks/syncfy`

The legacy `/syncfy/webhook` route is deprecated and returns a non-processing
deprecation response. Configure Syncfy to send events to the provider webhook
route above.

Supported event:

- credentials.refreshed

Additional events are recorded for audit purposes even if not processed.

---

# Imported Transaction Workflow

FlowLedger intentionally separates imported provider transactions from user-owned transactions.

Imported data flow:

Provider → ProviderImportedTransaction → User Review → Transaction

Benefits:

- Prevents accidental imports
- Allows categorization before creation
- Preserves original provider metadata
- Supports future reconciliation workflows

---

# Security Principles

FlowLedger prioritizes security over convenience.

Requirements:

- Passwords must be hashed.
- Secrets must never be committed.
- Bank login credentials must not be stored by FlowLedger.
- Webhook signatures must be verified when configured.
- User ownership must be enforced on all user data.

Never expose:

- passwordHash
- OAuth secrets
- Provider API keys
- Webhook secrets
- Syncfy tokens
- Bank usernames, passwords, OTPs, security answers, card numbers, or account
  login identifiers

---

# Environment Variables

Copy:

bash cp .env.example .env 

Do not commit real .env files.

Core variables include:

- DATABASE_URL
- JWT_SECRET
- JWT_EXPIRES_IN
- API_PORT
- WEB_APP_URL
- VITE_API_URL
- NODE_ENV

OAuth variables:

- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_CALLBACK_URL

Provider variables:

- SYNCFY_API_KEY
- SYNCFY_WEBHOOK_SIGNATURE_KEY
- SYNCFY_API_BASE_URL
- SYNCFY_DATA_BASE_URL
- SYNCFY_WIDGET_SCRIPT_URL
- SYNCFY_WIDGET_STYLE_URL
- PROVIDER_WEBHOOK_PUBLIC_BASE_URL

Syncfy auto-sync variables:

- SYNCFY_AUTO_SYNC_ENABLED
- SYNCFY_AUTO_SYNC_INTERVAL_MINUTES
- SYNCFY_AUTO_SYNC_JOB_TIMEOUT_MS
- SYNCFY_AUTO_SYNC_CONCURRENCY
- SYNCFY_TRANSACTION_LOOKBACK_DAYS

When enabled, the API starts a Syncfy scheduler on boot. It queues active
Syncfy provider connections with linked accounts, processes them with the
configured concurrency and timeout, and avoids overlapping runs. FlowLedger
stores only non-secret Syncfy provider metadata, including the Syncfy
`id_credential`, connection status, account metadata, and sanitized refresh
endpoint metadata needed for account and transaction import. Syncfy handles bank
credential entry through its widget. FlowLedger does not store user bank
usernames, passwords, OTPs, security answers, card numbers, account login
identifiers, or other bank login credential material.

If Syncfy requires interactive login, MFA, OTP, or stored refresh metadata is
unavailable, the connection is marked reconnect-required and the manual Syncfy
widget credential update flow remains the fallback.

Manual Syncfy flows use the widget credential entrypoints:

- Resync: `setEntrypointCredential(idCredential)`
- Reconnect/update: `setEntrypointUpdateCredential(idCredential)`

After either manual widget flow, the backend fetches both Syncfy accounts and
transactions from stored provider endpoints. Manual refreshes use bounded
server-side retry/backoff to allow Syncfy's data endpoints to finish updating
after the widget reports completion. The transaction refresh window defaults to
60 days through `SYNCFY_TRANSACTION_LOOKBACK_DAYS`.

---

# Development Commands

Development:

bash npm run dev 

Production-like local execution:

bash npm run start 

This builds the workspaces and runs the API plus the Vite preview server,
which is the closest local mode to staging without deploying infrastructure.

Build:

bash npm run build 

Type checking:

bash npm run typecheck 

Testing:

bash npm run test 

Linting:

bash npm run lint 

---

# Local Database Setup

Create database:

bash createdb flowledger 

Generate Prisma client:

bash npm run prisma:generate 

Run migrations:

bash npm run prisma:migrate 

Seed demo data:

bash npm run prisma:seed 

---

# Documentation

- `CLAUDE.md` — agent orientation and quick-start, plus root-level conventions and architecture pointers
- `apps/api/CLAUDE.md` / `apps/web/CLAUDE.md` / `database/CLAUDE.md` / `packages/shared/CLAUDE.md` — per-app/package structure and conventions
- `docs/DATA_MODEL.md` — all Prisma models and enums
- `docs/DOMAIN_LOGIC.md` — shared expenses, debts, settlements, reports
- `docs/PROVIDER_SYNC.md` — Syncfy integration and auto-sync scheduler
- `docs/AUTH_FLOW.md` — JWT, OAuth flows
- `docs/TESTING.md` — test file map
- `ROADMAP.md` — full milestone status and product direction

---

# Current Development Priorities

The Full Currency Logic group (Milestones 7-10) is complete — accounts, transactions, and debts all carry explicit currency fields, with live exchange rates from Frankfurter (fiat) and Binance (crypto). Current priority is the Full Crypto Adaptation group (Milestones 11-15), starting with Milestone 11: Binance API Integration.

See `ROADMAP.md` for the complete, authoritative implementation sequence and status — this section intentionally doesn't restate it.

---

# Branch Strategy

Main development branch:

- razs_ai

Stable branch:

- main

AI-generated changes should be developed in razs_ai and reviewed before merging into main.

---

# Future Vision

Planned future capabilities:

- Automatic transaction categorization
- Budgeting
- Savings goals
- Investment tracking
- Crypto integrations
- AI financial assistant
- Mobile applications
- Subscription plans

FlowLedger should evolve into a secure, provider-agnostic financial aggregation platform while remaining simple enough to be maintained by a small engineering team.
