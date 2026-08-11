import type { HttpHandler } from "msw";

/**
 * Default msw request handlers, active for every test via `src/tests/setup.ts`.
 * Empty by default — individual test files call `server.use(...)` (from
 * `./server`) to stub the specific `services/*.client.ts` endpoints they
 * exercise, keeping each test's mocked responses local to that test.
 */
export const handlers: HttpHandler[] = [];
