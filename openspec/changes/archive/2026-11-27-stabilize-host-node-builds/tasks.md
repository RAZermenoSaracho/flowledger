## 1. Repository pin (agent, in repo)

- [x] 1.1 Set `.nvmrc` to `22` and root `package.json` `engines.node` to `>=22.13.0`.
- [x] 1.2 Update the Node version references in `CLAUDE.md` and any README or docs that name Node 24; keep `docs/NOTIFICATION_MODELS.md` accurate about the permission-model flags on 22.
- [x] 1.3 Run `npm ci`, typecheck, lint and the unit suites under Node 22 (Docker integration tests belong to #196) and confirm `package-lock.json` is unchanged.

## 2. Verification on the host (agent, under Node 22, VMs running)

- [x] 2.1 Run `npm run build` 20 consecutive times and record exit codes.
- [x] 2.2 Run the shared, web and API unit suites 5 consecutive times and record exit codes.
- [x] 2.3 Confirm `ls ~/Library/Logs/DiagnosticReports | grep -c '^node-'` is unchanged from before the runs.
- [x] 2.4 (No run crashed.) If any run crashes, stop and report; the next options (VM memory caps, serialized deploys, one bounded build retry) need new owner approval.

## 3. Infrastructure (owner approval required first; see design.md)

- [x] 3.1 Owner approves the exact steps in `design.md`, "Infrastructure runbook". (orchestrator, gated)
- [x] 3.2 Confirm each PM2 app's Node binary with `pm2 describe` (read-only), apply the PM2 interpreter switch and deploy script change, and deploy to staging first. (orchestrator, gated)
- [x] 3.3 Moved to Odoo #200: watch the next 5 production deploys; each succeeds on attempt 1 (`gh run list --workflow deploy-prod.yml`).

## 4. Hardware (owner)

- [x] 4.1 Moved to Odoo #200 (owner): run Apple Diagnostics and a memory test.
