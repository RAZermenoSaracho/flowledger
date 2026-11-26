## Why

`package-lock.json` is ignored by `.gitignore` (line 149, commit 1e51519) and untracked, so every install resolves versions independently and `npm install` in `~/scripts/deploy-flowledger-prod.sh` can pull unreviewed transitive versions. Evidence (Odoo #179): fresh task worktrees resolve supertest 7.3.2 / superagent 10.4.2 / jsdom 30.1.3 instead of the dev clone's 7.2.2 / 10.3.0 / 30.0.1; with supertest 7.3.2 every supertest suite fails with `TypeError: Invalid URL`, and several Profile web tests break. The dev clone and the production clone hold different untracked lockfiles.

## What Changes

- Remove `package-lock.json` from `.gitignore` and commit the dev clone's root lockfile (single root lockfile; npm workspaces).
- Document `npm ci` at the root as the install command (one README line).
- Owner updates the external deploy script to `npm ci`; cutover and rollback are in design.md.

## Non-goals

- No CI workflow (separate intent; there is still no PR CI).
- No dependency upgrades, no edits to `~/scripts/*` or `~/.config/razs/*` from this change.

## Impact

`.gitignore`, `package-lock.json`, one README line. PR #91 (task #190) touches `env.ts`, `vitest.config.ts` and `docs/TESTING.md`; this change touches none of them (the install note goes in the README on purpose).
