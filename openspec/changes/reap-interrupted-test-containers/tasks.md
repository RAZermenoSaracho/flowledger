## 1. Helper

- [ ] 1.1 In `apps/api/src/tests/helpers/testDatabase.ts`, add `.withTmpFs({ "/var/lib/postgresql/data": "rw" })`, `.withEntrypoint(["timeout", String(MAX_LIFETIME_SECONDS), "docker-entrypoint.sh"])` and `.withCommand(["postgres"])` to the `PostgreSqlContainer` builder, with `MAX_LIFETIME_SECONDS = 1200` as a named constant.
- [ ] 1.2 Update the TSDoc of `startTestDatabase()` to state that the data directory is tmpfs and the container exits after the lifetime ceiling.

## 2. Documentation

- [ ] 2.1 In `docs/TESTING.md` (Vagrant VM section), document how Ryuk reaps (about 15 s after the client disconnects), that nothing recovers if Ryuk itself disappears mid-run, the 20-minute container ceiling, the read-only listing command (Engine API `curl` for containers filtered by label `org.testcontainers=true`, plus `/volumes`), and the manual removal step by container id.

## 3. Verification (record results in the Odoo task)

- [ ] 3.1 `npm run typecheck`, `npm run lint`, and one integration file pass against the VM.
- [ ] 3.2 Run `npm run test -w apps/api` once against the VM; files, tests and duration match a pre-change baseline taken the same way, with no new hook timeouts; the VM then lists 0 testcontainers containers and 0 volumes.
- [ ] 3.3 SIGKILL one integration file's process tree after Postgres is up; within 2 minutes the VM lists 0 containers and 0 volumes.
- [ ] 3.4 With the ceiling temporarily lowered to a few seconds in a scratch run, confirm the container is `exited` after that time and starts normally before it (do not commit the lowered value).
