## 1. Helper

- [ ] 1.1 In `apps/api/src/tests/helpers/testDatabase.ts`, add `.withTmpFs({ "/var/lib/postgresql/data": "rw" })` to the `PostgreSqlContainer` builder.
- [ ] 1.2 Update the TSDoc of `startTestDatabase()` to state that the data directory is tmpfs.

## 2. Documentation

- [ ] 2.1 In `docs/TESTING.md` (Vagrant VM section), document how Ryuk reaps (about 15 s after the client disconnects), the two cases it cannot cover (VM stop, kill between Ryuk create and start), the read-only listing command (Engine API `curl` for containers filtered by label `org.testcontainers=true`, plus `/volumes`), and the manual removal step by container id.

## 3. Verification (record results in the Odoo task)

- [ ] 3.1 `npm run typecheck`, `npm run lint`, and one integration file pass against the VM.
- [ ] 3.2 Run `npm run test -w apps/api` once against the VM; files, tests and duration match a pre-change baseline taken the same way, with no new hook timeouts; the VM then lists 0 testcontainers containers and 0 volumes.
- [ ] 3.3 SIGKILL one integration file's process tree after Postgres is up; within 2 minutes the VM lists 0 containers and 0 volumes.
