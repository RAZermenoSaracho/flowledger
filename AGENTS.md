# Agent Instructions

Agents working in this repository must read these guide files before making any code changes:

1. RULES.md
2. AGENTS.md
3. ROADMAP.md
4. README.md

The guide file hierarchy is:

- RULES.md → Universal engineering, security, and operational rules.
- AGENTS.md → Project-specific implementation guidance.
- ROADMAP.md → Product direction and implementation priorities.
- README.md → Human-facing setup, architecture, and operational documentation.

---

# Project Overview

FlowLedger is a web-first personal finance platform focused on:

- Personal finance tracking
- Bank integrations
- Automated transaction imports
- Shared expenses
- Debt tracking
- Financial reporting
- Future budgeting and AI-assisted financial insights

The project follows a modular monorepo architecture using npm workspaces.

Repository structure:

- apps/api
- apps/web
- packages/shared
- database

---

# Technology Stack

## Backend

Location:

- apps/api

Stack:

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- JWT Authentication
- Zod Validation

## Frontend

Location:

- apps/web

Stack:

- React
- Vite
- TypeScript
- Tailwind CSS
- TanStack Query
- React Router
- Recharts

## Shared Package

Location:

- packages/shared

Contains:

- Shared TypeScript types
- Shared constants
- Shared Zod schemas
- Shared API contracts

## Database

Location:

- database

Stack:

- PostgreSQL
- Prisma ORM

---

# Current Product Domains

FlowLedger currently contains:

## Authentication

- Email/password login
- JWT authentication
- Google OAuth

## Accounts

- Manual accounts
- Imported provider accounts
- Account linking
- Account archiving

## Categories

- Personal categories
- Group categories
- Category archiving

## Groups

Groups are the replacement for Households.

All new development must use:

- Group
- Groups

Do not introduce new Household terminology.

## Transactions

- Income
- Expense
- Transfers
- Imported transactions
- Transaction linking

## Shared Expenses

- Expense splitting
- Settlement tracking
- Debt generation

## Debts

Current debt system includes:

- I Owe
- Owed To Me
- Pending Settlement Requests
- Settled Debts

## Notifications

Used for:

- Settlement workflows
- Provider transaction review
- Future provider sync alerts

## Reports

- Summary
- Category reports
- Monthly cashflow

---

# Provider Architecture

FlowLedger uses a provider abstraction layer.

Current provider:

- Syncfy

Core provider files:

- provider.types.ts
- providerRegistry.ts
- providers.routes.ts
- providerWebhooks.routes.ts

Syncfy implementation:

- syncfy.adapter.ts
- syncfy.routes.ts
- syncfy.service.ts
- syncfy.webhookSecurity.ts
- syncfyAutoSyncScheduler.ts

Agents must extend the provider architecture instead of creating Syncfy-specific parallel systems.

Provider logic should remain reusable for future integrations.

Examples:

- Plaid
- Belvo
- MX
- Open Banking providers
- Crypto exchanges

---

# Syncfy Integration Rules

Current Syncfy implementation supports:

- User creation
- Session creation
- Widget-based account connection
- Webhook ingestion
- Account import
- Transaction import
- Imported transaction review

Current webhook security:

- HMAC verification
- request-signature validation
- Raw payload storage
- Webhook audit trail

Production Syncfy webhook event processing must use the generic provider route:

- `/providers/webhooks/syncfy`

The legacy `/syncfy/webhook` route is deprecated and must not process provider
events.

Never remove webhook signature validation.

Never weaken provider security.

Never log:

- API keys
- Tokens
- Credentials
- Webhook secrets
- Decrypted values

---

# Syncfy Auto-Sync

Auto-sync is implemented and running. The `SyncfyAutoSyncScheduler` is created and started in `server.ts` on boot. See `docs/PROVIDER_SYNC.md` for full details.

Scheduler behavior:
- Runs on configurable interval (default: disabled, set `SYNCFY_AUTO_SYNC_ENABLED=true`)
- Processes connections with `status` in `["active", "sync_failed"]` that have at least one confirmed linked `ProviderAccount`
- Skips connections with `requiresManualReconnect = true`
- Calls `resyncSyncfyConnection()` per job, same path as manual resync
- Detects MFA/OTP/auth errors via `shouldMarkSyncfyManualReconnect()` and marks connections reconnect-required automatically

Important:

FlowLedger does not store bank login credentials. Do not store user bank
usernames, passwords, OTPs, security answers, card numbers, account login
identifiers, or other bank login credential material.

Syncfy handles credential entry through its widget. FlowLedger stores only
non-secret Syncfy provider metadata needed for connection status, account
metadata, webhook processing, and refresh/import operations.

For current Syncfy flows, treat `id_credential` as the credential source of
truth. Manual resync should use `setEntrypointCredential(idCredential)`, and
manual credential refresh/reconnect should use
`setEntrypointUpdateCredential(idCredential)`.

Manual Syncfy refreshes must fetch both accounts and transactions from stored
provider endpoints after widget completion. Keep the refresh idempotent and use
bounded retry/backoff so recent provider data has time to appear without
duplicating imported transactions or overwriting user review decisions.

---

# Coding Requirements

## Branch

All AI-generated development work must occur on:

- razs_ai

Do not work directly on main.

## Environment Files

Never:

- Modify real .env files
- Commit .env files
- Commit secrets

Environment variables are managed by the repository owner.

If new environment variables are required:

- Document them
- Do not create real values

## Database

Use:

- Prisma migrations

Do not:

- Modify production databases
- Execute destructive SQL without approval

Schema changes must be:

- Backwards compatible when possible
- Migration-driven
- Reviewed carefully

---

# API Standards

All API input must be validated.

Prefer:

- Shared Zod schemas
- Shared DTOs

Maintain:

- User ownership checks
- User scoping
- Authentication enforcement

Never expose:

- passwordHash
- OAuth secrets
- Provider secrets
- Internal credentials

---

# Frontend Standards

FlowLedger is web-first.

UI goals:

- Responsive
- Mobile-friendly
- Minimal
- Clean
- Fast

Avoid:

- Heavy UI frameworks
- Unnecessary complexity
- Duplicate components

Prefer:

- Reusable components
- Shared hooks
- Shared utilities

---

# Testing Requirements

When changing:

- Authentication
- Providers
- Syncfy
- Transactions
- Shared calculations
- Security utilities

Add or update tests.

At minimum run:

bash npm run build npm run typecheck npm run test 

If tests cannot run:

Document why.

Document remaining risks.

---

# Operational Restrictions

Agents must NOT:

- Deploy applications
- Restart servers
- Modify infrastructure
- Change DNS
- Modify Cloudflare
- Modify production databases
- Modify secrets
- Modify CI/CD pipelines

Unless explicitly instructed by a human operator.

---

# Documentation Requirements

When architecture changes:

Update:

- README.md
- ROADMAP.md
- AGENTS.md
- Relevant docs/ files

When security changes:

Update:

- README.md
- Relevant docs/ files

Documentation must remain aligned with actual implementation.

## Documentation map

| File | Purpose |
|---|---|
| `CLAUDE.md` | Agent orientation and quick-start reference |
| `docs/ARCHITECTURE.md` | Full stack, directory structure, env vars, ports |
| `docs/DATA_MODEL.md` | All Prisma models and enums |
| `docs/API_REFERENCE.md` | All routes with method/path/auth/description |
| `docs/FRONTEND_MAP.md` | Pages, components, hooks, services |
| `docs/AUTH_FLOW.md` | JWT, email/password, Google OAuth flows |
| `docs/PROVIDER_SYNC.md` | Provider abstraction, Syncfy integration, auto-sync |
| `docs/DOMAIN_LOGIC.md` | Groups, shared expenses, debts, settlements, reports |
| `docs/CONVENTIONS.md` | Code patterns, validation, naming, ESM rules |
| `docs/TESTING.md` | Test file map and what each covers |

---

# Working Philosophy

Priorities:

1. Security
2. Correctness
3. Maintainability
4. Simplicity
5. User Experience
6. Performance

Prefer:

- Small focused commits
- Clear code
- Explicit behavior
- Incremental improvements

Avoid:

- Overengineering
- Premature microservices
- Unnecessary dependencies
- Large unrelated refactors

FlowLedger should remain understandable, maintainable, and scalable by a small engineering team.
