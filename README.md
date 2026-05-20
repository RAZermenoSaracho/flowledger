# FlowLedger

FlowLedger is a responsive web-first personal finance MVP for tracking accounts,
categories, income, expenses, shared expense splits, and basic financial reports.

## Architecture

This repository is an npm workspaces monorepo:

- `apps/api`: Express API with TypeScript, Prisma, PostgreSQL, JWT auth, and Zod
  validation.
- `apps/web`: React + Vite frontend with Tailwind CSS, React Router, TanStack
  Query, and Recharts.
- `packages/shared`: shared constants, Zod schemas, and TypeScript types.
- `database`: Prisma schema and optional seed script.

The MVP uses local PostgreSQL directly. Docker and external finance
integrations are intentionally out of scope for this first version.

## MVP Features

- Register and sign in with email/password.
- Store hashed passwords and authenticate with JWT bearer tokens.
- Manage accounts and categories.
- Create, edit, search, and filter transactions.
- View transaction detail records.
- Track shared expenses and participant split status.
- View summary, category, and monthly cashflow reports.
- Use a mobile-friendly responsive web UI.

## Environment Variables

Copy `.env.example` to `.env` for local development and adjust values:

```bash
cp .env.example .env
```

Required variables:

- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_SECRET`: long random secret used to sign JWTs.
- `JWT_EXPIRES_IN`: token lifetime, for example `7d`.
- `API_PORT`: API port, default `4000`.
- `WEB_PORT`: Vite dev server port, default `5173`.
- `VITE_API_URL`: API URL used by the frontend.
- `NODE_ENV`: `development`, `test`, or `production`.

Do not commit real `.env` files.

## Local PostgreSQL Setup

Create a local database before running Prisma migrations:

```bash
createdb flowledger
```

Example local connection string:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/flowledger?schema=public"
```

Use the username, password, host, and port that match your local PostgreSQL
installation.

## Install And Setup

Install dependencies:

```bash
npm install
```

Generate the Prisma client:

```bash
npm run prisma:generate
```

Create database tables:

```bash
npm run prisma:migrate
```

Optionally seed demo data:

```bash
npm run prisma:seed
```

Demo seed login:

- Email: `demo@flowledger.local`
- Password: `flowledger-demo`

## Development Commands

Run API and web app together:

```bash
npm run dev
```

Run only the API:

```bash
npm run dev:api
```

Run only the web app:

```bash
npm run dev:web
```

Build all packages:

```bash
npm run build
```

Run linting:

```bash
npm run lint
```

Run type checks:

```bash
npm run typecheck
```

Run available tests:

```bash
npm run test
```

## API Endpoints

Auth:

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

Accounts:

- `GET /accounts`
- `POST /accounts`
- `PUT /accounts/:id`
- `DELETE /accounts/:id`

Categories:

- `GET /categories`
- `POST /categories`
- `PUT /categories/:id`
- `DELETE /categories/:id`

Transactions:

- `GET /transactions`
- `POST /transactions`
- `GET /transactions/:id`
- `PUT /transactions/:id`
- `DELETE /transactions/:id`

Transaction filters:

- `dateFrom`
- `dateTo`
- `categoryId`
- `accountId`
- `type`
- `search`

Shared expenses:

- `GET /shared-expenses`
- `POST /shared-expenses`
- `GET /shared-expenses/:id`
- `PUT /shared-expenses/:id`
- `DELETE /shared-expenses/:id`

Reports:

- `GET /reports/summary`
- `GET /reports/by-category`
- `GET /reports/monthly-cashflow`

## Roadmap

Next hardening work:

- Add focused API tests for auth, user scoping, filters, and reports.
- Improve form-level error states in the web app.
- Add richer shared expense participant editing.
- Review production CORS, logging, and JWT secret handling.

Future expansion:

- Bank integrations.
- Crypto account integrations.
- Automated transaction syncing.
- Budgeting and savings goals.
- AI insights.
- Mobile apps.
- Subscription features.
