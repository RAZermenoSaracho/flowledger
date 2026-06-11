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

The API loads the repository root `.env` file when started from either the
monorepo root or `apps/api`, so do not duplicate environment files inside
workspace packages. This also keeps PM2-style process working directories
compatible with the same root `.env`.

Required variables:

- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_SECRET`: long random secret used to sign JWTs.
- `JWT_EXPIRES_IN`: token lifetime, for example `7d`.
- `API_PORT`: API port, default `4000`.
- `WEB_PORT`: Vite dev server port, default `5173`.
- `VITE_API_URL`: API URL used by the frontend.
- `GOOGLE_CLIENT_ID`: Google OAuth web client ID.
- `GOOGLE_CLIENT_SECRET`: Google OAuth web client secret. API only; never expose
  this to the frontend.
- `GOOGLE_CALLBACK_URL`: API callback URL registered in Google OAuth, for
  example `http://localhost:4000/auth/google/callback`.
- `WEB_APP_URL`: Public web app URL used after OAuth completes, for example
  `http://localhost:5173`.
- `NODE_ENV`: `development`, `test`, or `production`.

Optional provider integration variables:

- `SYNCFY_API_KEY`: Syncfy API key for provider integration calls.
- `SYNCFY_WEBHOOK_SIGNATURE_KEY`: Syncfy webhook signature key. When configured,
  Syncfy webhook endpoints validate the `request-signature` header before
  processing. Leave unset only for local development bypass.
- `SYNCFY_API_BASE_URL`: Syncfy API base URL. Defaults to
  `https://api.syncfy.com`.
- `SYNCFY_DATA_BASE_URL`: Syncfy data endpoint base URL used for account and
  transaction endpoint URLs returned in webhook payloads. Defaults to
  `https://sync.paybook.com`.
- `PROVIDER_WEBHOOK_PUBLIC_BASE_URL`: Public base URL for provider webhook
  registration, for example
  `https://your-public-api.example.com/providers/webhooks`.
- `SYNCFY_WIDGET_SCRIPT_URL`: Public browser-loaded Syncfy widget module URL.
- `SYNCFY_WIDGET_STYLE_URL`: Public browser-loaded Syncfy widget stylesheet URL.

Do not commit real `.env` files.

## Syncfy Local And Staging Setup

Syncfy integration is available from the Accounts page. The API creates the
Syncfy user and session for the signed-in FlowLedger user when a provider
connection is started; no manual database writes are required.

Local setup:

1. Set `SYNCFY_API_KEY` in the root `.env`. Set
   `SYNCFY_WEBHOOK_SIGNATURE_KEY` if testing signed webhook delivery.
2. Keep the default local app URLs: `VITE_API_URL=http://localhost:4000` and
   `WEB_APP_URL=http://localhost:5173`.
3. Expose the API with a temporary HTTPS tunnel, then set
   `PROVIDER_WEBHOOK_PUBLIC_BASE_URL` to the tunnel's provider webhook base,
   for example `https://example-tunnel.ngrok-free.app/providers/webhooks`.
4. Register the Syncfy webhook URL as
   `${PROVIDER_WEBHOOK_PUBLIC_BASE_URL}/syncfy`. The legacy local endpoint
   `POST /syncfy/webhook` is still present, but new provider setup should use
   `POST /providers/webhooks/syncfy`.
5. Start the app with `npm run dev`, sign in, open Accounts, search/select an
   institution, and start the connection. The API calls Syncfy to create or
   reuse a Syncfy user for the current FlowLedger user, creates a Syncfy
   session, and returns widget config to the web app. The web app loads the
   public widget script/style URLs and opens the widget with the session token.

Staging setup:

1. Configure staging with real `SYNCFY_API_KEY`,
   `SYNCFY_WEBHOOK_SIGNATURE_KEY`, `SYNCFY_API_BASE_URL`,
   `SYNCFY_DATA_BASE_URL`, `SYNCFY_WIDGET_SCRIPT_URL`, and
   `SYNCFY_WIDGET_STYLE_URL` values approved for that environment.
2. Set `WEB_APP_URL` and `VITE_API_URL` to the staging web/API origins.
3. Set `PROVIDER_WEBHOOK_PUBLIC_BASE_URL` to the staging API provider webhook
   base, for example `https://api-staging.example.com/providers/webhooks`.
4. Register `https://api-staging.example.com/providers/webhooks/syncfy` in
   Syncfy as the webhook destination.

Expected Syncfy events:

- `credentials.updated`: accepted and recorded for audit, but not imported by
  the current importer.
- `credentials.refreshed`: processed by the importer. The payload should include
  `header.user.id_user`, `payload.id_credential`, and account/transaction
  endpoints under `payload.endpoints`.
- `jobs.completed`: accepted and recorded for audit, but not imported by the
  current importer.

Imported data storage:

- Syncfy user mappings are stored in `UserAuthAccount` with provider `syncfy`.
- Provider connection state is stored in `ProviderConnection`.
- Imported account metadata is stored in `ProviderAccount`. Confirming imported
  accounts from the Accounts page links each provider account to an existing or
  newly created FlowLedger `Account`.
- Imported transaction metadata is stored in `ProviderImportedTransaction`.
  These rows preserve provider IDs and raw payload data; they are separate from
  manually created FlowLedger `Transaction` rows.
- Webhook deliveries are stored in `ProviderWebhookEvent` with raw payload,
  headers, raw body text, processing status, and any error message.

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
- `GET /auth/google`
- `GET /auth/google/callback`
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
