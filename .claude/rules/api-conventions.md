# API conventions (apps/api)

Standing rule — condensed checklist for backend work. Full detail (module system, providers, request lifecycle) lives in `apps/api/CLAUDE.md`; read that before any non-trivial backend change.

## Module layering

Every module under `src/modules/<domain>/` only gets the layers it needs, but never skips the split:

```
utils/          pure helpers, module-specific
types/          module-specific types
services/       create.service.ts / read.service.ts / update.service.ts / delete.service.ts
controllers/    thin: parse/validate input, call a service, shape the response — no Prisma, no business logic
<domain>.routes.ts   wires Express routes, no logic
```

Providers (external API integrations) live inside the module that owns their domain, under `<domain>/providers/<provider-name>/` — never a standalone `providers` module, never Syncfy-specific logic outside `accounts/providers/syncfy/`. Extend `FinancialProviderAdapter` for new providers.

## Request lifecycle

```
helmet → cors → express.json → morgan → requireAuth → validate(schema, target?) → asyncHandler(controllerFn) → errorHandler
```

## Hard rules

- Always wrap controllers in `asyncHandler()` — never bare `try/catch`.
- Enforce ownership in the Prisma `where` clause (`findFirst({ where: { id, userId } })`) — never load then check in JS.
- Always call `serialize()` on Prisma responses before `res.json()` (`Decimal` → `number`).
- Use `notFound()` from `utils/httpError.ts` for missing-or-unauthorized resources — one response shape, no info leak about existence.
- Read env vars only via `import { env } from '../config/env.js'` — never `process.env.*` directly. Add new vars to the Zod schema in `env.ts` AND `.env.example`, or startup fails.
- Relative imports need `.js` extensions (Node ESM) even though the source is `.ts`.
- Inline Zod schemas in a route file are not allowed — they belong in `packages/shared/src/schemas/`.
- Never bypass the Syncfy webhook HMAC check (`accounts/providers/syncfy/syncfy.webhookSecurity.ts`).
- Never return `passwordHash` or OAuth secrets in any response.
- `prisma.$executeRaw`/raw SQL requires explicit approval.
- Business logic, filtering, sorting, grouping belongs in `read.service.ts` — never in a controller, never in the frontend.
