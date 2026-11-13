---
name: deploy
description: How FlowLedger production deploys work — the trigger flow only; the actual deploy script lives outside this repo
---

# Deploy

FlowLedger has no Dockerfile, PM2/ecosystem config, or compose file in this repo — deployment is a single external script triggered by a GitHub Actions workflow.

## Trigger flow

```
push to `main`
  → .github/workflows/deploy-prod.yml (self-hosted runner)
  → ~/scripts/deploy-flowledger-prod.sh   (outside this repo, not versioned here)
```

`deploy-prod.yml` has no build/test gate of its own — whatever checks happen, happen inside that external script or must be done manually before pushing to `main`. There is no PR-level CI (see root `CLAUDE.md`'s "Testing" section) — always run `npm run typecheck && npm run lint && npm run test` yourself before a change reaches `main`.

## Notification worker

The API and notification worker are independent PM2 processes from the same build. Stopping the worker pauses processing; ingestion continues until queue capacity is reached. See [Notification Models — Deployment](../../../docs/NOTIFICATION_MODELS.md#deployment).

The operator applies two host changes:

1. Register the worker once:

   ```bash
   cd ~/production/flowledger/apps/api && pm2 start npm --name flowledger-prod-worker --kill-timeout 15000 --exp-backoff-restart-delay 1000 -- run start:worker && pm2 save
   ```

2. In `~/scripts/deploy-flowledger-prod.sh` (outside the repo), add `pm2 restart flowledger-prod-worker --update-env` after `pm2 restart flowledger-prod-api` and before `pm2 save`. Keep migrate → build → API → worker order.

Staging uses the same commands with its own checkout and process name. After deployment, run `curl -fsS http://127.0.0.1:4000/health/notification-worker` and `pm2 status`; expect 200 and both processes online.

## Domains

| Env | Web | API |
|---|---|---|
| Production | `flowledger.razs.dev` | (see `~/scripts/deploy-flowledger-prod.sh` / server config — not in this repo) |
| Dev/preview | `flowledger-dev.razs.dev` | `api-flowledger-dev.razs.dev` |

## What this skill does not cover

The full external deploy script (including rollback behavior) is not versioned here — read `~/scripts/deploy-flowledger-prod.sh` directly on this machine if you need to know exactly what it does.

## Constraints

- Pushing to `main` triggers a real production deploy — this is a hard-to-reverse, shared-system action. Never push to `main` without the user's explicit go-ahead for that specific push (see the Git Safety Protocol — a prior approval doesn't carry forward to a new push).
- Work happens on `razs_ai`; getting changes to `main` is a separate, explicit step the user drives.
