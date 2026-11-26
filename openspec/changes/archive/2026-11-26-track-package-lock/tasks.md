## 1. Repository change
- [x] 1.1 In a clean worktree copy the dev clone's `package-lock.json`; `grep -E '_authToken|/Users/|localhost'` finds nothing; run `npm ci`, `npm run prisma:generate`, typecheck, lint, test; commit that worktree copy and `cmp` it with the dev clone's file.
- [x] 1.2 Remove `package-lock.json` from `.gitignore`; add one `npm ci` line to README.md (not `docs/TESTING.md`).

## 2. Rollout (owner-driven, see design.md)
- [x] 2.1 Merge to `razs_ai`; staging: backup, `git pull`, `cmp`, `npm ci` (must succeed), full suite incl. Docker integration, `pm2 restart flowledger-dev-*`.
- [x] 2.2 With owner authorization: deploy script `npm install` -> `npm ci`; back up the production lockfile.
- [ ] 2.3 Merge to `main`; verify `/health/notification-worker` and `pm2 status`.

## Outcome (owner accepted 2026-11-26)

- 2.1 Staging ran 2c08d64, a local merge of razs_ai and this change, rather than a razs_ai merge, so staging held only the candidate. The staging lockfile backup was taken first, and the tracked lockfile was byte-identical to it.
  - `npm ci` and the full build succeeded, and all 1126 installed packages matched the lockfile.
  - A clean worktree with no copied lockfile: `npm ci` and build succeed; API 2707/2707 (all testcontainers suites), web 1866/1866, shared 448/448; typecheck and lint clean.
- 2.2 The production lockfile, node_modules, deploy script and commit 7bae288 were backed up to `~/backups/pre179-20261126_163139/`.
  - The deploy script now runs `npm ci` and refuses to deploy without a lockfile.
  - Before `git pull`, it copies a lockfile git does not yet track to `~/backups/`, because the pull that starts tracking it overwrites it silently (reproduced).
  - It was switched before this merge. Until the merge, `npm ci` uses production's existing lockfile, which matches its installed tree, so no deploy could fail in between.
- 2.3 Performed by the promotion that carries this archive; production verification evidence is recorded in Odoo #179.
- Dependency review: no breaking changes; npm audit goes from 59 to 35 advisories (critical 1 to 0, high 31 to 12), with nothing new. The owner accepted helmet 8.2.0 to 8.1.0 (no behavioral difference for FlowLedger's config) and the Syncfy widget going from 2.0.0 to 2.1.2.
