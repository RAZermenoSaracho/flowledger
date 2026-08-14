# Testing

Standing rule — condensed checklist. Full architecture, stack rationale, coverage thresholds, and how-to-write-a-test examples live in `docs/TESTING.md`; read that before adding or modifying any test, this file is only the quick-recall version.

## Before writing any test

1. Locate the source file's `tests/` folder (sibling, same base name) — don't invent a new location.
2. Check whether this is a **unit test** (mirrors one source file), a **module-level test** (whole-module route wiring, lives in the module's root `tests/`), or a **cross-module integration/e2e test** (`src/tests/integration/` or `src/tests/e2e/`) — placement differs per kind, see `docs/TESTING.md`.
3. Confirm you're using the right mocking layer for the kind of test (see table below) — don't mix them.

## Placement cheat sheet

| Source file | Test file |
|---|---|
| `apps/api/.../services/create.service.ts` | `apps/api/.../services/tests/create.service.test.ts` |
| `apps/web/.../hooks/useThing.ts` | `apps/web/.../hooks/tests/useThing.test.ts` |
| `apps/api/.../<module>.routes.ts` (whole-module wiring) | `apps/api/.../<module>/tests/<module>.routes.test.ts` |
| 2+ api modules together | `apps/api/src/tests/integration/` |
| full api request flow | `apps/api/src/tests/e2e/` |
| `packages/shared/src/schemas/x.ts` | `packages/shared/src/schemas/tests/x.test.ts` |

## Mocking layer per test kind

| Test kind | Tool |
|---|---|
| API service unit | `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — never a real DB |
| API route/integration/e2e | `supertest` + `@testcontainers/postgresql` — real Postgres, requires Docker running |
| Web component/hook | `@testing-library/react` + `@testing-library/user-event`, `jsdom` |
| Web `fetch` mocking | `msw` — intercepts `services/*.client.ts` calls, never mock a `.client.ts` module directly |

## Rules

- One test file, one source file (or one flow, for module/integration/e2e tests). If a test file is accumulating unrelated scenarios, split the source file first.
- Every new/changed `controllers/`, `services/`, `utils/`, `hooks/`, or `components/` file gets a matching test file — this is a hard requirement from root `CLAUDE.md`, not optional.
- Unit tests never touch Docker or a real database; only `src/tests/integration/` and `src/tests/e2e/` in `apps/api` need Docker locally (see `CLAUDE.local.md` for this machine's Docker-via-Vagrant setup).
- Coverage is enforced per-glob in each `vitest.config.ts` — highest on `utils/` (~90-95%), moderate on `services/`/`hooks/` (~85-90%), unenforced on `controllers/`/routes/`components/`. Don't chase coverage numbers on the unenforced tiers at the expense of test quality elsewhere.
- `*.types.ts`, `constants/`, bootstrap files (`server.ts`, `app.ts`, `main.tsx`), and barrel `index.ts` files are excluded from coverage entirely — don't write tests just to move their number.
