# Testing

---

## Stack

| Concern | Tool |
|---|---|
| Test runner (all workspaces) | [Vitest](https://vitest.dev) |
| Coverage | `@vitest/coverage-v8` |
| API route integration | `supertest` against the exported Express `app` (see `apps/api/src/app.ts`) |
| API integration DB | `@testcontainers/postgresql` — a real, ephemeral Postgres container, migrated with Prisma before the suite runs |
| API service unit tests | `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real database |
| Web component/hook tests | `@testing-library/react` + `@testing-library/user-event`, `jsdom` environment |
| Web API mocking | `msw` (Mock Service Worker) — intercepts the `fetch` calls made by `services/api.client.ts`, so components and hooks are tested exactly as they call the real client functions |

Vitest is used identically in `apps/api`, `apps/web`, and `packages/shared` — one runner, one config shape, one `describe`/`it`/`expect` API everywhere. Only the `environment` (`node` vs `jsdom`) and the mocking layer (Prisma vs `fetch`) differ per workspace.

---

## Directory architecture

Tests live next to the code they cover, mirroring the source tree at every level:

```
<any-folder-of-testable-files>/
  <file>.ts
  tests/
    <file>.test.ts       one test file per source file, same base name
```

This applies to every `controllers/`, `services/`, `utils/`, `hooks/`, and `components/` folder in the repo — e.g.:

```
apps/api/src/modules/transactions/services/create.service.ts
apps/api/src/modules/transactions/services/tests/create.service.test.ts

apps/web/src/pages/Debts/hooks/useDebtSettlementWorkflow.ts
apps/web/src/pages/Debts/hooks/tests/useDebtSettlementWorkflow.test.ts

packages/shared/src/schemas/transactions.ts
packages/shared/src/schemas/tests/transactions.test.ts
```

**Module-level tests** — those that don't correspond to a single source file, such as an API module's full route-wiring integration test (`debts.routes.test.ts`, exercising `debts.routes.ts` end to end through every controller/service/middleware it wires together) — live in a `tests/` folder at the module's root, not inside `controllers/tests/` or `services/tests/`:

```
apps/api/src/modules/debts/tests/debts.routes.test.ts
```

**Cross-module integration and end-to-end tests** live under a top-level `src/tests/` in each app, split by scope:

```
apps/api/src/tests/integration/   real Postgres via testcontainers; exercises 2+ modules
                                    together through the actual HTTP layer (e.g. creating
                                    a shared expense and confirming the resulting debt and
                                    notification records)
apps/api/src/tests/e2e/           full request-response flows a real client would make —
                                    register → login → create data → read it back —
                                    against the same testcontainers Postgres
apps/api/src/tests/helpers/       shared test infrastructure (not tests themselves):
                                    prismaMock.ts, testDatabase.ts, authTestUser.ts

apps/web/src/tests/integration/   multiple components/hooks/pages rendered together against
                                    a shared msw server and a real React Query cache — e.g. a
                                    page's data-fetch → render → user interaction → refetch cycle
apps/web/src/tests/e2e/           full user flows across routes with `MemoryRouter` (login →
                                    protected route → sign out); still jsdom, not a real browser —
                                    there is no browser automation tool in this stack
apps/web/src/tests/mocks/         msw request handlers and server setup (not tests themselves)
apps/web/src/tests/utils/         `renderWithProviders()` and other test-only render helpers
```

`packages/shared` has no controllers/services/hooks/components — only `schemas/tests/` and (if it grows non-trivial logic) `utils/tests/` apply there.

**One file, one concern.** A test file covers exactly one source file (or, for module-root/integration/e2e tests, exactly one flow). If a source file's test starts accumulating unrelated scenarios, that's a signal the source file itself is doing too much — split the source file, not just the test.

---

## Coverage thresholds

Configured per-workspace in each `vitest.config.ts`'s `test.coverage.thresholds`, keyed by glob so different layers get different bars:

| Layer | Threshold | Why |
|---|---|---|
| `utils/` (every workspace) | ~90–95% (statements/branches/functions/lines) | Pure business logic and financial calculations — the highest-risk, highest-value code to have wrong |
| `services/` (`apps/api`), `hooks/` (`apps/web`) | ~85–90% | Business logic, but with more external dependencies (DB, React lifecycle) that make some branches expensive to cover |
| `controllers/`, `<domain>.routes.ts` | No enforced minimum | Thin wiring, covered incidentally by route integration tests — not worth chasing a number |
| `components/` (`apps/web`) | No enforced minimum | Covered incidentally by integration/e2e tests and targeted interaction tests; JSX branch coverage on presentational code is low signal |

**Excluded from coverage entirely** (not just a lower threshold — not counted at all):
- `*.types.ts` and any `types/` folder
- Static config/constants (`constants/`, `packages/shared/src/constants/`, `apps/api/src/config/env.ts`)
- Bootstrap files with no branching logic of their own: `apps/api/src/server.ts`, `apps/api/src/app.ts`, `apps/web/src/main.tsx`
- Barrel/re-export files (`index.ts` that only re-exports)
- Everything under any `tests/` folder itself

---

## How to run

```bash
npm run test                        # run every workspace's suite once (root orchestrator)
npm run test -w apps/api            # one workspace only
npm run test -w apps/web
npm run test -w packages/shared

npm run test:watch -w apps/api      # watch mode, any workspace

npm run test:coverage               # coverage report for every workspace
npm run test:coverage -w apps/api   # coverage for one workspace — writes apps/api/coverage/
```

`apps/api` integration/e2e tests (anything under `src/tests/integration/` or `src/tests/e2e/`) require Docker running locally (testcontainers pulls and starts a real `postgres` image per suite run). Unit tests (`services/tests/`, `utils/tests/`, `controllers/tests/`) never touch Docker or a real database — they run everywhere `npm test` runs, including CI without a database service.

---

## Writing a test

### API service unit test — mocked Prisma (`vitest-mock-extended`)

```ts
// apps/api/src/modules/transactions/services/tests/create.service.test.ts
import { describe, expect, it } from "vitest";
import { mockPrisma, resetPrismaMock } from "../../../../tests/helpers/prismaMock.js";
import { createTransaction } from "../create.service.js";

describe("createTransaction", () => {
  beforeEach(() => resetPrismaMock());

  it("creates an expense transaction scoped to the owning user", async () => {
    mockPrisma.transaction.create.mockResolvedValue(/* ... */);

    const result = await createTransaction("user-1", { /* ... */ });

    expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-1" }) })
    );
  });
});
```

`mockPrisma` is a `mockDeep<PrismaClient>()` singleton shared by every service test; `resetPrismaMock()` (calls `mockReset`) runs in a `beforeEach` so tests never leak mock state into each other. Service files import the real `prisma` singleton from `src/db/prisma.ts` — tests never mock that module directly; instead `src/db/prisma.ts` itself is swapped for the mock via Vitest's `vi.mock`, done once inside the helper so individual test files never repeat the wiring.

### API route integration test — supertest against a real Postgres

```ts
// apps/api/src/modules/debts/tests/debts.routes.test.ts
import request from "supertest";
import type { Express } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDatabase.js";
import { createAuthedUser } from "../../../tests/helpers/authTestUser.js";

let app: Express;

describe("GET /debts", () => {
  beforeAll(async () => {
    // app.js constructs the real PrismaClient at import time, which reads
    // DATABASE_URL at construction (not lazily on first query) — so app.js
    // must be dynamically imported *after* startTestDatabase() points
    // DATABASE_URL at the container, never statically imported at the top
    // of the file.
    await startTestDatabase();
    ({ app } = await import("../../../app.js"));
  });
  afterAll(async () => {
    await stopTestDatabase();
  });

  it("returns only the requesting user's debt participants", async () => {
    const { token } = await createAuthedUser(app);

    const response = await request(app)
      .get("/debts")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
  });
});
```

### Web component test — Testing Library + msw

```tsx
// apps/web/src/pages/Debts/components/tests/DebtSummaryCard.test.tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { DebtSummaryCard } from "../DebtSummaryCard";

describe("DebtSummaryCard", () => {
  it("shows the net balance with a positive-owed styling", () => {
    renderWithProviders(<DebtSummaryCard balance={42.5} />);
    expect(screen.getByText(/42\.50/)).toBeInTheDocument();
  });
});
```

`renderWithProviders()` wraps `QueryClientProvider` + `MemoryRouter` (and `AuthProvider`/`ThemeProvider` when the tree under test needs them) so component tests never hand-roll the provider stack. The global msw server (`src/tests/mocks/server.ts`) is started once in `src/tests/setup.ts` (Vitest `setupFiles`); individual tests call `server.use(...)` to override a handler for one scenario, and `afterEach` (also in `setup.ts`) resets to the default handlers.

---

## What is intentionally not tested

- Real bank/OAuth/exchange-rate provider APIs (Syncfy, Google, Binance, Frankfurter) — provider `*.client.ts` files are tested against recorded/mocked HTTP responses, never the live third-party service
- Visual regression / screenshot testing — no tool in the stack for this
- Real browser automation — web e2e tests run in `jsdom` via `MemoryRouter`, not a real browser (no Playwright/Cypress in this stack)
- Load/performance testing
