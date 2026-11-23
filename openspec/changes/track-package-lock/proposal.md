## Why

`package-lock.json` is ignored by `.gitignore` (line 149, added in commit 1e51519) and untracked. Every install resolves versions independently, so production deploys (`npm install` in `~/scripts/deploy-flowledger-prod.sh`) can pull unreviewed transitive versions, and `npm install` rewrites the lockfile in place on each deploy. Evidence (Odoo #179): fresh task worktrees resolve supertest 7.3.2 / superagent 10.4.2 / jsdom 30.1.3 instead of the dev clone's 7.2.2 / 10.3.0 / 30.0.1; with supertest 7.3.2 every supertest suite fails with `TypeError: Invalid URL`, and several Profile web tests break on the jsdom drift. The dev clone and `~/production/flowledger` already hold different untracked lockfiles (about 2200 lines of diff), both with supertest 7.2.2.

## What Changes

- Remove `package-lock.json` from `.gitignore` and commit the single root lockfile (npm workspaces: no per-workspace lockfiles exist or are wanted).
- Commit the dev clone's lockfile (the known-good one the suites pass against), verified in a clean worktree, rather than a regenerated one.
- Document `npm ci` at the repository root as the install command (README / `docs/TESTING.md` install note); dependency changes land as reviewed lockfile diffs.
- Cutover of the external deploy script and review launcher is an owner action documented in design.md; this change does not edit anything outside the repo.

## Non-goals

- No CI workflow (separate intent; there is still no PR CI).
- No dependency upgrades, no `.npmrc`, no audit tooling.
- No edits to `~/scripts/*` or `~/.config/razs/*` (owner-managed).

## Impact

- Repo: `.gitignore`, `package-lock.json` (new, tracked), one docs line.
- External: `~/scripts/deploy-flowledger-prod.sh` (`npm install` -> `npm ci`), staging dev clone, production clone untracked-lockfile cleanup.
- Compatible with PR #91 (task #190): it touches `apps/api/src/config/env.ts`, `apps/api/vitest.config.ts`, `docs/TESTING.md`; this change touches only `.gitignore`, the lockfile and at most a separate docs line. Only `docs/TESTING.md` can conflict textually; keep the install note out of it (use README) or rebase after #91.
