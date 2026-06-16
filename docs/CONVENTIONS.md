# Conventions

---

## Project language

- **TypeScript throughout.** All source files in `apps/api`, `apps/web`, and `packages/shared` are `.ts` / `.tsx`.
- **ESM only.** The API uses `"type": "module"` in `package.json`. Use `import`/`export`, not `require`.
- **Zod schemas from `@flowledger/shared`.** Don't define request/response schemas inline in route files. Put them in `packages/shared/src/schemas/` and import them.

---

## Naming

| Thing | Convention | Example |
|---|---|---|
| Files | `camelCase.ts` | `transactions.routes.ts` |
| Routes file | `<module>.routes.ts` | `accounts.routes.ts` |
| Service file | `<module>.service.ts` | `syncfy.service.ts` |
| Test file | `<subject>.test.ts` | `syncfyAutoSync.test.ts` |
| Prisma models | `PascalCase` | `TransactionRelation` |
| DB columns | `camelCase` (Prisma convention) | `createdAt`, `providerCredentialId` |
| Env vars | `SCREAMING_SNAKE_CASE` | `SYNCFY_AUTO_SYNC_ENABLED` |
| API routes | `kebab-case` | `/shared-expenses`, `/monthly-cashflow` |
| React components | `PascalCase.tsx` | `AppLayout.tsx` |
| Custom hooks | `useCamelCase.ts` | `useAuth.ts` |
| Vite env vars | `VITE_*` prefix | `VITE_API_URL` |

---

## Express route structure

Routes are organized by domain module under `apps/api/src/modules/<module>/`. Each module has exactly one `<module>.routes.ts` file that exports a configured `Router`.

### Typical route handler pattern

```ts
router.get('/resource/:id', requireAuth, asyncHandler(async (req, res) => {
  const record = await prisma.resource.findFirst({
    where: { id: req.params.id, userId: req.user.id }, // ownership enforced here
  });
  if (!record) throw notFound();
  res.json(serialize(record));
}));
```

Key parts:
- `requireAuth` applied per router, not globally
- `asyncHandler()` wraps all async handlers — never use `try/catch` in route bodies
- `notFound()` (from `utils/errors.ts`) returns `new HttpError(404)`
- Ownership is enforced with `findFirst({ where: { id, userId } })` — if the record doesn't belong to the user, the `findFirst` returns null, and `notFound()` is thrown (consistent 404, no ownership leakage)
- `serialize()` applied before every response

### `asyncHandler`

Location: `apps/api/src/middleware/asyncHandler.ts`

```ts
asyncHandler(fn) → (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
```

Converts a rejected promise into a call to `next(error)`, which the global error handler picks up.

### `HttpError` / error utilities

Location: `apps/api/src/utils/errors.ts`

- `new HttpError(statusCode, message?)` — thrown to send a structured error response
- `notFound(message?)` — factory for `HttpError(404)`
- The global error handler in `server.ts` converts `HttpError` to `{ error: message }` with the correct status code. Unhandled errors become 500.

---

## Validation middleware

```ts
import { validate } from '../middleware/validate.js';
import { mySchema } from '@flowledger/shared';

router.post('/resource', requireAuth, validate(mySchema), asyncHandler(async (req, res) => {
  // req.body is now typed and validated
}));
```

`validate(schema, target?)` where `target` is `"body"` (default), `"query"`, or `"params"`. On validation failure it throws `HttpError(400)` with Zod error details.

---

## Serialization

### `serialize()`

Location: `apps/api/src/utils/serialize.ts`

Recursively transforms Prisma model output:
- `Decimal` → `number`
- `Date` → ISO string (already handled by JSON.stringify, but `serialize()` normalizes for consistency)

Apply to any route response that includes Prisma model data:
```ts
res.json(serialize(record));
res.json({ records: records.map(serialize) });
```

### `publicUser()`

Strips `passwordHash` from a `User` object before returning it in any response. Used in all auth endpoints and `/auth/me`.

---

## Prisma patterns

### Ownership enforcement

Always include `userId` (or `groupId` via membership check) in `findFirst`/`findUnique` queries when accessing user-owned data. Never load a record and then check ownership in JavaScript:

```ts
// Correct
const tx = await prisma.transaction.findFirst({ where: { id, userId: req.user.id } });
if (!tx) throw notFound();

// Wrong — leaks existence
const tx = await prisma.transaction.findFirst({ where: { id } });
if (tx?.userId !== req.user.id) throw new HttpError(403);
```

### Decimal fields

Prisma uses `Decimal` (from `@prisma/client`) for money fields. Always call `serialize()` before sending these in responses. In arithmetic, convert with `.toNumber()` or use `prisma.$queryRaw` for aggregates.

### Transactions (Prisma transactions)

Use `prisma.$transaction([...])` when multiple writes must be atomic. Example: creating settlement transactions paired with updating `SharedExpenseParticipant.paidAmount`.

---

## Shared package (`@flowledger/shared`)

Location: `packages/shared/src/`

- **`schemas/`** — Zod schemas for request validation (used by both API and web).
- **`types/`** — TypeScript types derived from Zod schemas (`z.infer<typeof schema>`).
- **`constants/`** — Shared enum-like constants (e.g., provider keys).

Rules:
- Do not put runtime logic in `@flowledger/shared`. Only schemas, types, and constants.
- Rebuild the shared package whenever schemas change: `npm run build -w packages/shared` or use `npm run dev` which builds shared first.

---

## Frontend data fetching

All server state is managed with TanStack Query v5 (`@tanstack/react-query`).

- Queries use `queryKey` arrays that encode the request parameters.
- Mutations use `useMutation` and invalidate relevant query keys on success.
- `apiRequest<T>(path, options?)` in `services/api.ts` is the only fetch utility — do not use `fetch` directly.
- Errors from `apiRequest` are `ApiError` instances with a `status` field.

---

## Environment variables

### API (`apps/api`)

All env vars are parsed and validated at startup by `apps/api/src/config/env.ts` using a Zod schema. Never read `process.env.*` directly in route or service files — import from `config/env.ts`:

```ts
import { env } from '../config/env.js';
const port = env.API_PORT;
```

If a new env var is needed, add it to the Zod schema in `env.ts`. Adding it only to `.env.example` without the schema will cause a startup error.

### Web (`apps/web`)

Vite env vars must be prefixed with `VITE_` to be accessible in the browser. Access via `import.meta.env.VITE_*`.

---

## Error handling at the boundary

The API global error handler (end of `server.ts`) handles:
- `HttpError` instances → `{ error: message }` with the status code
- Zod `ZodError` (from validate middleware) → 400 with issues array
- Unknown errors → 500 with a generic message in production

Never expose stack traces or internal error details in responses. The handler suppresses them in production.

---

## Testing

See `docs/TESTING.md` for the test file map and running instructions.

- Tests use Node's built-in `node:assert/strict` — no test framework.
- Run with `npm test` from the repo root.
- Test files live in `apps/api/tests/`.
- Mock env vars before importing modules that read them at import time (e.g., `syncfy.service.ts`).

---

## File imports

The API uses ESM with explicit `.js` extensions on all relative imports (Node ESM requirement, even though the source is `.ts`):

```ts
import { something } from './utils/errors.js'; // .js extension required
```

The TypeScript compiler resolves `.ts` → `.js` during build.

---

## Comments

Write comments only when the **why** is non-obvious — a hidden constraint, workaround, or subtle invariant. Don't document what the code does; well-named identifiers do that. Don't reference the current task or PR in comments.

---

## Branch strategy

- Default branch: `main`
- Feature branch naming: `razs_<feature>` (e.g., `razs_ai`, `razs_settlements`)
- Merge via PR; squash or merge commit both acceptable
