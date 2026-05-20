# flowledger Roadmap

## Vision

FlowLedger is a modern personal finance platform for tracking expenses, shared spending, accounts, and financial insights in one clean dashboard.

## Current Architecture

FlowLedger is an npm workspaces monorepo:

- `apps/api`: Node.js, TypeScript, Express, Prisma ORM, PostgreSQL, JWT auth,
  Zod validation.
- `apps/web`: React, Vite, TypeScript, Tailwind CSS, React Router, TanStack
  Query, Recharts.
- `packages/shared`: common constants, TypeScript types, and Zod schemas shared
  by API and web.
- `database`: Prisma schema and optional local seed script.

The MVP intentionally avoids Docker, bank integrations, crypto integrations,
subscriptions, Stripe, OCR, AI insights, React Native, and external APIs.

## MVP Scope

Implemented baseline capabilities:

- Email/password registration and login.
- JWT-protected API routes.
- User-scoped accounts, categories, transactions, and shared expenses.
- Transaction search and filters by date range, category, account, type, and
  search text.
- Transaction detail view with related move and shared expense data.
- Summary, category, and monthly cashflow reports.
- Responsive web UI for dashboard, transactions, accounts, categories, reports,
  and shared expense splits.

## Future Expansion Areas

- Bank integrations and automated transaction syncing.
- Crypto account integrations.
- Budgets and savings goals.
- AI insights after enough local financial data exists.
- Mobile apps once the web API and domain model stabilize.
- Subscription and billing features if the product direction requires them.

## Milestones

### Milestone 1 - Project Definition

Status: DONE

Goals:

- Refine project requirements.
- Confirm architecture and security constraints.
- Identify the first small implementation slice.

### Milestone 2 - First Implementation Slice

Status: DONE

Goals:

- Implement MVP monorepo with API, web app, shared package, Prisma schema, and
  setup documentation.
- Add shared Zod validation and user-scoped API access.
- Update README.md with setup and usage notes.

### Milestone 3 - Hardening

Status: NEXT

Goals:

- Improve reliability and observability.
- Add focused automated tests for auth, user scoping, transaction filters, and
  reports.
- Review security and operational risks, including JWT secret handling and CORS
  configuration.
- Prepare a human-reviewed pull request from `razs_ai` into `main`.
