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

## Domains

| Env | Web | API |
|---|---|---|
| Production | `flowledger.razs.dev` | (see `~/scripts/deploy-flowledger-prod.sh` / server config — not in this repo) |
| Dev/preview | `flowledger-dev.razs.dev` | `api-flowledger-dev.razs.dev` |

## What this skill does not cover

The external deploy script's actual steps (build, restart, health check, rollback) are not in this repo and are not reproduced here — read `~/scripts/deploy-flowledger-prod.sh` directly on this machine if you need to know exactly what it does.

## Constraints

- Pushing to `main` triggers a real production deploy — this is a hard-to-reverse, shared-system action. Never push to `main` without the user's explicit go-ahead for that specific push (see the Git Safety Protocol — a prior approval doesn't carry forward to a new push).
- Work happens on `razs_ai`; getting changes to `main` is a separate, explicit step the user drives.
