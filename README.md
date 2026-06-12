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

## Authentication

Implemented:

- Email/password authentication
- JWT sessions
- Google OAuth
- GitHub OAuth

---

## Accounts

Implemented:

- Manual accounts
- Provider accounts
- Initial balances
- Account archiving

---

## Categories

Implemented:

- Personal categories
- Group categories
- Category archiving

---

## Groups

Implemented:

- Group creation
- Group membership
- Shared categories
- Shared expenses

Groups replace the original Household model.

All new development must use Group terminology.

---

## Transactions

Implemented:

- Income transactions
- Expense transactions
- Transfer transactions
- Imported transactions
- Transaction relationships

Capabilities:

- Search
- Filtering
- Sorting
- Detail views

---

## Shared Expenses

Implemented:

- Shared expense creation
- Participant tracking
- Settlement workflows

---

## Debts

Implemented:

- I Owe
- Owed To Me
- Pending Settlement Requests
- Settled Debts

---

## Reports

Implemented:

- Summary reports
- Category reports
- Monthly cashflow reports

---

## Notifications

Implemented:

- Settlement notifications
- Imported transaction notifications

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

Core provider files:

apps/api/src/modules/providers

Important files:

- provider.types.ts
- providerRegistry.ts
- providers.routes.ts
- providerWebhooks.routes.ts

Current Syncfy implementation:

- syncfy.adapter.ts
- syncfy.routes.ts
- syncfy.service.ts
- syncfy.webhookSecurity.ts

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
- Provider credentials must never be stored in plaintext.
- Webhook signatures must be verified when configured.
- User ownership must be enforced on all user data.

Never expose:

- passwordHash
- OAuth secrets
- Provider API keys
- Webhook secrets
- Encrypted credential material

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
- WEB_PORT
- WEB_APP_URL
- VITE_API_URL
- NODE_ENV

OAuth variables:

- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_CALLBACK_URL
- GITHUB_CLIENT_ID
- GITHUB_CLIENT_SECRET
- GITHUB_CALLBACK_URL

Provider variables:

- SYNCFY_API_KEY
- SYNCFY_WEBHOOK_SIGNATURE_KEY
- SYNCFY_API_BASE_URL
- SYNCFY_DATA_BASE_URL
- SYNCFY_WIDGET_SCRIPT_URL
- SYNCFY_WIDGET_STYLE_URL
- PROVIDER_WEBHOOK_PUBLIC_BASE_URL

Planned auto-sync variables:

- SYNCFY_AUTO_SYNC_ENABLED
- SYNCFY_AUTO_SYNC_INTERVAL_MINUTES
- SYNCFY_AUTO_SYNC_JOB_TIMEOUT_MS
- SYNCFY_AUTO_SYNC_CONCURRENCY

---

# Development Commands

Development:

bash npm run dev 

Production-like local execution:

bash npm run start 

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

# Current Development Priorities

Current active work:

1. Syncfy reliability improvements.
2. Automatic provider synchronization.
3. Connection health monitoring.
4. Reconnect workflows.
5. Imported transaction review improvements.
6. Financial automation features.

See ROADMAP.md for the complete implementation sequence.

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