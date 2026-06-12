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
- GitHub OAuth

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

---

# Current Development Focus

Status: ACTIVE

Primary focus is improving provider synchronization reliability.

The goal is to minimize manual user intervention while maintaining security.

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

Status: IN PROGRESS

Goals:

## Connection Health Tracking

Track:

- Active
- Expired
- Reconnect Required
- Sync Failed

states for provider connections.

## Secure Credential Storage

If supported by Syncfy:

- Encrypt stored credential material.
- Never store plaintext credentials.

If not supported:

- Use reconnect-required workflows.

## Manual Resync

Allow users to:

- Trigger synchronization without reconnecting.

## Manual Reconnect

Allow users to:

- Reopen Syncfy widget.
- Refresh credentials.
- Repair expired connections.

## Automated Synchronization

Implement background synchronization:

- Queue-based processing
- Configurable intervals
- Retry handling
- Timeout handling
- Failure tracking

## Dynamic Token Handling

Detect institutions requiring:

- MFA
- OTP
- Dynamic authentication

Automatically:

- Mark connection as reconnect-required.
- Notify users.

---

# Milestone 6 - Financial Automation

Status: PLANNED

Goals:

- Automatic transaction categorization
- Categorization rules
- Recurring transaction detection
- Merchant recognition
- Duplicate detection

---

# Milestone 7 - Budgeting

Status: PLANNED

Goals:

- Monthly budgets
- Category budgets
- Savings goals
- Budget alerts
- Forecasting

---

# Milestone 8 - Investments

Status: PLANNED

Goals:

- Investment accounts
- Portfolio tracking
- Performance reporting
- Asset allocation reporting

---

# Milestone 9 - Crypto Integrations

Status: PLANNED

Goals:

- Exchange integrations
- Wallet integrations
- Portfolio aggregation
- PnL tracking

---

# Milestone 10 - AI Financial Assistant

Status: PLANNED

Goals:

- Spending insights
- Budget recommendations
- Cashflow forecasting
- Financial anomaly detection
- Personalized financial recommendations

AI features must operate on user-authorized financial data only.

---

# Milestone 11 - Mobile Applications

Status: PLANNED

Goals:

- iOS application
- Android application
- Shared API backend
- Push notifications

---

# Milestone 12 - SaaS Platform

Status: PLANNED

Goals:

- Subscription plans
- Premium integrations
- Premium reporting
- AI subscription features
- Multi-tier account management

Only pursue monetization after the platform reaches maturity and reliability targets.

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