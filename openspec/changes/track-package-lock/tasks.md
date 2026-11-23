## 1. Verify the lockfile (clean worktree)
- [ ] 1.1 Copy the dev clone's `package-lock.json` into a fresh worktree; run `npm ci`, `npm run prisma:generate`, `npm run typecheck`, `npm run lint`, `npm run test`; confirm the lockfile is unchanged and has no secrets or local paths.

## 2. Repository change
- [ ] 2.1 Remove `package-lock.json` from `.gitignore`; commit the verified lockfile.
- [ ] 2.2 Add one install line (`npm ci` at root) to README.md (not `docs/TESTING.md`, to avoid conflict with PR #91).

## 3. Rollout (owner-driven, see design.md)
- [ ] 3.1 Staging cutover: back up untracked lockfile, pull, `npm ci`, restart pm2 `flowledger-dev-*`.
- [ ] 3.2 Owner updates `~/scripts/deploy-flowledger-prod.sh` (guard-move untracked lockfile, `git pull`, `npm ci`) before the merge to `main`.
- [ ] 3.3 Production deploy with explicit go-ahead; verify health and `pm2 status`; keep backups until one deploy succeeds.
