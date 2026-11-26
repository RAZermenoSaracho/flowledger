## Lockfile choice

Commit the dev clone's `/Users/razs/projects/flowledger/package-lock.json`, not a regenerated one: regenerating resolves newer supertest 7.3.x / jsdom 30.1 and reproduces the failing suites. `npm ci --dry-run` against the current `package.json` files succeeds. Verification happens in a clean worktree (task 1.1).

## Install rules

Root lockfile only; run `npm ci` at the repository root. `npm ci` fails when `package.json` and the lockfile disagree, which is the desired guard. Dependency updates: `npm install <pkg>` at root, and the lockfile diff is reviewed in the PR.

## Cutover

The lockfile is ignored and untracked today in the dev clone (`razs_ai`) and in `~/production/flowledger` (`main`). Git treats an ignored untracked file as expendable, so `git pull` silently overwrites it; nothing aborts. The only reason to copy it first is rollback.

`npm ci` works with the existing untracked production lockfile, so the script can switch to it before the lockfile reaches `main`, with no broken window.

1. Merge to `razs_ai` (no deploy: `deploy-prod.yml` triggers on `main` only). Staging: `cp package-lock.json ~/package-lock.dev.bak`, `git pull`, `cmp package-lock.json ~/package-lock.dev.bak` (expect identical), `npm ci`, run the full suite including Docker integration/e2e, `pm2 restart flowledger-dev-*`.
2. With the owner's authorization, change `~/scripts/deploy-flowledger-prod.sh` from `npm install` to `npm ci`, and `cp ~/production/flowledger/package-lock.json ~/package-lock.prod.bak`.
3. Merge to `main` (explicit go-ahead). The deploy pulls the tracked lockfile and runs `npm ci`. Verify `curl -fsS http://127.0.0.1:4000/health/notification-worker` and `pm2 status`.

The review launcher `~/.config/razs/launchers/flowledger-dev` already runs `npm ci` when a lockfile exists; only its "gitignored" comment goes stale.

## Accepted risk

`npm ci` deletes `node_modules` before installing, so running pm2 services can degrade briefly until the script's restart step. Deploys are rare and users are trusted at this stage; no pm2 stop is added.

Production's lockfile differs from the dev clone's (about 2200 diff lines), so the first production `npm ci` moves it to the dev clone's versions. Staging passing the full suite first is the mitigation.

## Rollback

Reverting the commit deletes the tracked lockfile from the working tree, so `npm ci` would then fail. Order matters:

1. Set the deploy script back to `npm install` first.
2. Revert the commit on `main` (the deploy runs `npm install`).
3. Optionally restore `~/package-lock.<env>.bak`.

If `npm ci` fails after the pull: on the server run `npm install` and `pm2 restart` by hand, then revert as above.

## Owner decisions

- Confirm committing the dev clone's lockfile.
- Authorize the deploy script change (step 2) and who runs the staging cutover.
