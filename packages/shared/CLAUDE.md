# packages/shared — Claude Code Guide

TypeScript package that exports Zod schemas, inferred types, and constants shared between `apps/api` and `apps/web`. It is the single contract layer — both apps import from `@flowledger/shared`.

See the root `CLAUDE.md` for monorepo-level constraints and branch rules.

---

## What this package exports

```
src/
  schemas/          One file per domain — Zod schemas for request/response validation
    accounts.ts
    auth.ts
    categories.ts
    common.ts       Reusable primitives (moneySchema, optionalDateStringSchema, etc.)
    debts.ts
    groups.ts
    notifications.ts
    providers.ts
    reports.ts
    sharedExpenses.ts
    transactions.ts
  types/
    index.ts        TypeScript types: some inferred from schemas (z.infer<>), some hand-written
  constants/
    index.ts        Enum-like string tuple constants (TRANSACTION_TYPES, ACCOUNT_TYPES, etc.)
  index.ts          Re-exports everything — import from '@flowledger/shared', not sub-paths
```

---

## How it is consumed

Both apps import directly from the package name:

```ts
// In apps/api (validate middleware):
import { transactionSchema } from '@flowledger/shared';

// In apps/web (form validation or type annotations):
import type { TransactionType } from '@flowledger/shared';
```

The package is a workspace dependency (`"@flowledger/shared": "*"` in each app's `package.json`). Node resolves it to the local `packages/shared/` directory.

---

## How to build

The shared package must be compiled before either app can run. It compiles to ESM (tsc output in `dist/`).

```bash
# Build shared only:
npm run build -w packages/shared

# Or from repo root (builds everything in order):
npm run build

# Dev mode (root dev script builds shared first, then runs apps):
npm run dev
```

If you change a schema or type and the apps aren't picking it up, rebuild shared.

---

## How to add a new schema or type

**New Zod schema:**
1. Add it to the appropriate file in `src/schemas/` (or create a new `<domain>.ts` if needed)
2. Export it from that file
3. Re-export from `src/index.ts` (or confirm the file is already re-exported via `export *`)
4. Rebuild: `npm run build -w packages/shared`
5. In `apps/api`: use via `validate(mySchema)` middleware
6. In `apps/web`: import as a type or use for client-side validation

**New TypeScript type:**
- If it can be inferred from a schema: use `export type MyType = z.infer<typeof mySchema>`
- If it's a standalone shape (e.g., an API response type): add it to `src/types/index.ts`

**New constant:**
- Add to `src/constants/index.ts` as a `const` tuple: `export const MY_VALUES = ['a', 'b'] as const`
- Derive the type in `src/types/index.ts`: `export type MyValue = (typeof MY_VALUES)[number]`

---

## What belongs here vs in each app

| Belongs in `packages/shared` | Belongs in the app |
|---|---|
| Request/response Zod schemas | Route handler logic |
| TypeScript types for API shapes | UI components, hooks, pages |
| Enum-like constants shared by both apps | App-specific utilities |
| Reusable schema primitives (e.g., `moneySchema`) | Database query logic (Prisma) |

**Rule:** if only one app needs it, it does not belong here. If adding it here requires importing from an app, it definitely does not belong here.

---

## What to never do

- Import from `apps/api` or `apps/web` — this package has no knowledge of either app
- Add runtime logic (API calls, database queries, business calculations) — schemas, types, and constants only
- Use `require()` — this package is ESM (`"type": "module"`)
- Add app-specific UI types or API client logic
- Skip rebuilding after schema changes — the apps use the compiled `dist/`, not the source directly

---

## Read before touching

| File | Why |
|---|---|
| `src/index.ts` | All exports — check here first to see what already exists |
| `src/schemas/common.ts` | Shared schema primitives used across many domain schemas |
| `src/constants/index.ts` | All shared enum constants — check before adding a new one |
| `src/types/index.ts` | All shared TypeScript types and how they relate to constants |
