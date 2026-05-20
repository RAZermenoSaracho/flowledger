# flowledger Roadmap

## Vision

FlowLedger is a modern personal finance platform for tracking expenses, shared spending, accounts, and financial insights in one clean dashboard.

## Initial Codex Prompt

/codeproject Create a new full-stack monorepo project called "FlowLedger".

Before making changes:
1. Read RULES.md, AGENTS.md, and ROADMAP.md first.
2. RULES.md is authoritative and must be respected.
3. AGENTS.md and ROADMAP.md may be updated if needed to better align them with this project and its architecture.
4. Keep AGENTS.md and ROADMAP.md clean, practical, and synchronized with the current implementation.
5. Do not make commits.
6. Do not push anything.
7. Avoid dangerous refactors, unnecessary abstractions, or unrelated changes.
8. Keep the MVP simple, modular, and functional.
9. Do not use Docker for this MVP.
10. Assume PostgreSQL is installed locally.

Project goal:
Build an initial MVP of a responsive web-first personal finance app where users can:
- register income and expense transactions
- categorize transactions
- search/filter transactions
- view reports and summaries
- manage accounts
- manage shared expenses and splits with other users

This project should be architected for future expansion into:
- bank integrations
- crypto account integrations
- automated transaction syncing
- budgeting
- savings goals
- AI insights
- mobile apps
- subscriptions

Use this stack:

Frontend:
- React
- Vite
- TypeScript
- Tailwind CSS
- React Router
- TanStack Query
- Recharts

Backend:
- Node.js
- TypeScript
- Express or Fastify
- Prisma ORM
- PostgreSQL
- JWT auth
- Zod validation

General:
- npm workspaces monorepo
- clean modular architecture
- simple modern minimal responsive UI
- mobile-friendly responsive design
- centralized reusable components where practical

Expected repo structure:

flowledger/
  apps/
    web/
    api/
  packages/
    shared/
  database/
  .env.example
  README.md
  AGENTS.md
  ROADMAP.md
  RULES.md

Backend architecture:

apps/api/src/
  config/
  db/
  middleware/
  utils/
  modules/
    auth/
    users/
    accounts/
    categories/
    transactions/
    shared-expenses/
    reports/
  server.ts

Frontend architecture:

apps/web/src/
  components/
  pages/
    LoginPage.tsx
    RegisterPage.tsx
    DashboardPage.tsx
    TransactionsPage.tsx
    TransactionDetailPage.tsx
    AccountsPage.tsx
    CategoriesPage.tsx
    ReportsPage.tsx
    SharedExpensesPage.tsx
  services/
  hooks/
  types/
  constants/
  layout/
  main.tsx

Shared package:

packages/shared/src/
  schemas/
  types/
  constants/

Database requirements:
Use Prisma with PostgreSQL.

Create these entities:

1. User
- id
- name
- email
- passwordHash
- createdAt
- updatedAt

2. Account
- id
- userId
- name
- type
- identifier
- createdAt
- updatedAt

3. Category
- id
- userId
- name
- type: income | expense
- color optional
- createdAt
- updatedAt

4. Transaction
- id
- userId
- name
- amount
- type: income | expense | transfer
- date
- categoryId optional
- accountId optional
- notes optional
- createdAt
- updatedAt

5. TransactionRelation
- id
- transactionId
- relatedTransactionId
- relationType
- createdAt

6. SharedExpense
- id
- transactionId
- ownerUserId
- title
- totalAmount
- status
- createdAt
- updatedAt

7. SharedExpenseParticipant
- id
- sharedExpenseId
- userId optional
- participantName
- shareAmount
- paidAmount
- status
- createdAt
- updatedAt

Auth requirements:
- Email/password auth
- Password hashing
- JWT authentication
- Protected routes
- Auth middleware
- User-scoped data access
- Never expose password hashes

Validation:
- Use Zod for request validation
- Validate all API payloads
- Add proper error handling

API endpoints:

Auth:
- POST /auth/register
- POST /auth/login
- GET /auth/me

Accounts:
- CRUD /accounts

Categories:
- CRUD /categories

Transactions:
- CRUD /transactions
- GET /transactions with filters:
  - dateFrom
  - dateTo
  - categoryId
  - accountId
  - type
  - search

- GET /transactions/:id with:
  - details
  - related moves
  - shared expense data if applicable

Shared expenses:
- CRUD /shared-expenses

Reports:
- GET /reports/summary
- GET /reports/by-category
- GET /reports/monthly-cashflow

Frontend requirements:
Create responsive pages:

- Login/Register
- Dashboard
- Transactions list
- Transaction create/edit form
- Transaction detail
- Accounts
- Categories
- Reports
- Shared expenses page

Frontend behavior:
- Minimal modern dashboard
- Summary cards:
  - total income
  - total expenses
  - current balance

- Transaction filters:
  - category
  - account
  - type
  - date range
  - search

- Category report charts
- Monthly cashflow chart
- Responsive mobile-first layouts
- Reusable components
- Avoid giant CSS files
- Prefer Tailwind utility classes

Shared package:
Create shared:
- TypeScript types
- Zod schemas
- constants

Quality requirements:
- ESLint
- Prettier
- basic lint setup
- clean folder organization
- modular services/controllers
- no overengineering
- no enterprise complexity
- readable code first

Environment variables:
Create .env.example with:

DATABASE_URL=
JWT_SECRET=
JWT_EXPIRES_IN=
API_PORT=
WEB_PORT=
VITE_API_URL=
NODE_ENV=

Database setup:
Do not use Docker.

Assume PostgreSQL exists locally.

Add README instructions for:
- creating local PostgreSQL database
- configuring DATABASE_URL
- running:
  - prisma generate
  - prisma migrate dev
  - optional seed script

Optional:
- Add seed script with demo:
  - categories
  - accounts
  - sample transactions

Do NOT implement:
- bank integrations
- crypto integrations
- Plaid/Belvo/Fintoc
- subscriptions
- Stripe
- AI insights
- OCR
- React Native
- external APIs

Documentation:
Update README.md with:
- project overview
- architecture explanation
- setup instructions
- environment variables
- local PostgreSQL setup
- Prisma setup
- development commands
- MVP features
- future roadmap

After implementation:
Run and verify if available:
- npm install
- npm run build
- npm run lint
- npm run test
- prisma generate
- TypeScript checks

If something fails:
- fix reasonable issues
- document unresolved issues clearly

Final response format:
1. Summary of implementation
2. Files/folders created
3. How to run locally
4. Required environment variables
5. Commands executed
6. Build/lint/test results
7. Known limitations
8. Suggested next steps

## Milestones

### Milestone 1 - Project Definition

Status: NEXT

Goals:

- Refine project requirements.
- Confirm architecture and security constraints.
- Identify the first small implementation slice.

### Milestone 2 - First Implementation Slice

Status: PLANNED

Goals:

- Implement the smallest useful version.
- Add focused validation or tests.
- Update README.md with setup and usage notes.

### Milestone 3 - Hardening

Status: PLANNED

Goals:

- Improve reliability and observability.
- Review security and operational risks.
- Prepare a human-reviewed pull request from `razs_ai` into `main`.
