import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer
} from "@testcontainers/postgresql";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(
  moduleDir,
  "../../../../../database/prisma/schema.prisma"
);

let container: StartedPostgreSqlContainer | undefined;

/**
 * Starts an ephemeral Postgres container (testcontainers) and applies every
 * Prisma migration against it, pointing `DATABASE_URL` at the container
 * before returning. Call this in a `beforeAll`, and dynamically `import()`
 * anything that transitively imports `src/config/env.ts` only *after* it
 * resolves — `env.ts` reads `DATABASE_URL` at module-load time, so a static
 * top-level import would capture the wrong value. Requires Docker running
 * locally; never used by unit tests.
 */
export async function startTestDatabase(): Promise<string> {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const connectionUri = container.getConnectionUri();
  process.env.DATABASE_URL = connectionUri;

  execFileSync(
    "npx",
    ["prisma", "migrate", "deploy", "--schema", schemaPath],
    {
      env: { ...process.env, DATABASE_URL: connectionUri },
      stdio: "inherit"
    }
  );

  return connectionUri;
}

/** Stops the container started by `startTestDatabase()`. Call in `afterAll`. */
export async function stopTestDatabase(): Promise<void> {
  await container?.stop();
  container = undefined;
}
