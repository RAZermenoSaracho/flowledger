## Lockfile choice

Commit the dev clone's `/Users/razs/projects/flowledger/package-lock.json` (lockfileVersion matches npm on Node 24; `npm ci --dry-run` against current `package.json` files succeeds, 1128 packages, no `localhost` or local path strings, so no secrets or machine paths). Regenerating would resolve newer supertest/jsdom and reproduce the failures. Verification before commit, in a clean worktree: copy the lockfile, `npm ci`, `npm run prisma:generate`, `npm run typecheck`, `npm run lint`, `npm run test` (unit; integration/e2e need Docker per CLAUDE.local.md). Then confirm `git status` shows the lockfile unchanged after `npm ci` and `npm audit` output is identical on two clones.

If a regenerated lockfile is ever needed, it is a separate reviewed change, not part of this one.

## Install rules

Root lockfile only; run `npm ci` at the repository root (workspaces install from it). `npm ci` fails if `package.json` and the lockfile disagree, which is the desired guard. Dependency updates: run `npm install <pkg>` at root, commit the lockfile diff for review.

## Cutover (ordering matters)

`git pull`/checkout aborts when an incoming tracked file would overwrite an untracked one. Locations with an untracked lockfile today: dev clone (`/Users/razs/projects/flowledger`, branch `razs_ai`), production (`~/production/flowledger`, branch `main`, lockfile modified by every `npm install`). Worktrees created from a tracked commit are fine.

1. Merge the change to `razs_ai` (not `main`) first. No deploy fires (deploy-prod.yml triggers on `main` only).
2. Staging (dev clone): `mv package-lock.json ~/package-lock.dev.bak`, `git pull`, `git diff --quiet` the tracked lockfile against the backup (should be identical; if not, keep the tracked one), `npm ci`, restart pm2 `flowledger-dev-*`. The review launcher already uses `npm ci` when a lockfile exists, so worktrees from the tracked commit need no launcher change; its stale "gitignored" comment is cosmetic.
3. Before the change reaches `main`: owner edits `~/scripts/deploy-flowledger-prod.sh`: after `git checkout main`, when the lockfile is untracked (`git ls-files --error-unmatch package-lock.json` fails) run `mv package-lock.json package-lock.untracked.bak`; then `git pull origin main`; then `npm ci` in place of `npm install`. After the first successful deploy the guard is a harmless no-op and can be removed. Script change must land before the merge to `main`; merging first makes the deploy fail at `git pull` (before migrations and the DB backup, so no partial state).
4. Merge `razs_ai` to `main` (owner-driven, explicit go-ahead), watch the deploy, run `curl -fsS http://127.0.0.1:4000/health/notification-worker` and `pm2 status`.

Local files are preserved by `mv` to a `.bak` rather than deleting.

## Rollback

- Deploy fails at `git pull`: nothing changed (it precedes the DB backup and migrations); restore the `.bak` lockfile and re-run.
- Bad lockfile after merge: revert the commit on `main`/`razs_ai`; restore the `.bak` lockfile and set the script back to `npm install`, which works with or without a tracked lockfile. Keep the `.bak` files until one production deploy succeeds.
- The script change alone is safe before the merge: the guard is a no-op and `npm ci` needs a lockfile, so the script must only switch to `npm ci` once the lockfile is on `main` (or while the untracked file is still present, since `npm ci` accepts it).

## Risks

- `~/production/flowledger`'s lockfile differs from the dev clone's; production will move to the dev clone's versions on first `npm ci` (a controlled, reviewed change, but a real version delta). Run the full suite and a staging deploy first.
- Production lockfile is rewritten by each `npm install`, so it is never clean; the `mv` step must not be skipped.
- Reproducibility is only as good as lockfile freshness; Dependabot or manual bumps are out of scope.
- Sibling worktree task-190 and PR #91 are unaffected; do not touch their lockfile copies.

## Owner decisions

- Confirm committing the dev clone's lockfile (vs a regenerated one that likely needs test fixes for supertest 7.3.x / jsdom 30.1).
- Confirm the script ordering (script first, then merge to `main`) and who runs the staging cutover.
- Whether to add a PR CI workflow using `npm ci` (separate intent).
