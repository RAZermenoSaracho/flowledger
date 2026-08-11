import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/** The shared msw server instance started once in `src/tests/setup.ts`; tests override handlers per scenario with `server.use(...)`. */
export const server = setupServer(...handlers);
