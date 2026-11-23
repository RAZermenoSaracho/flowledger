## 1. Repository change
- [ ] 1.1 In a clean worktree copy the dev clone's `package-lock.json`; `grep -E '_authToken|/Users/|localhost'` finds nothing; run `npm ci`, `npm run prisma:generate`, typecheck, lint, test; commit that worktree copy and `cmp` it with the dev clone's file.
- [ ] 1.2 Remove `package-lock.json` from `.gitignore`; add one `npm ci` line to README.md (not `docs/TESTING.md`).

## 2. Rollout (owner-driven, see design.md)
- [ ] 2.1 Merge to `razs_ai`; staging: backup, `git pull`, `cmp`, `npm ci` (must succeed), full suite incl. Docker integration, `pm2 restart flowledger-dev-*`.
- [ ] 2.2 With owner authorization: deploy script `npm install` -> `npm ci`; back up the production lockfile.
- [ ] 2.3 Merge to `main`; verify `/health/notification-worker` and `pm2 status`.
