# Design

## Context

See `proposal.md` for the finding. Access JWTs are verified in exactly one place (`middleware/auth.ts`); `verifyCredential` in `middleware/credential.ts` already rejects JWTs for `/v1` and MCP. The web client keeps access tokens in memory and refreshes on 401 (`apps/web/src/services/api.client.ts`).

## Goals / Non-Goals

**Goals:** close the token-confusion path with the smallest change that is safe to deploy alone.

**Non-Goals:** see `proposal.md`.

## Security invariants

1. A request reaches a protected route only with a verified access-purpose token.
2. `req.user.id` is always a non-empty string on a protected route.
3. Each JWT verifier names its audience and algorithm.
4. Every token purpose is rejected by every other purpose's verifier.

## Decisions

### D1. Verify audience, algorithm, subject, and email in one function

`tokens.ts` gains an access-token audience constant, `signAccessToken` sets it, and a new `verifyAccessToken` returns `{ id, email }` or throws. `requireAuth` calls it and maps any failure to the existing 401. `middleware/credential.ts` already imports from `modules/`, so this adds no new kind of dependency.

*Alternative:* only reject a missing `sub` in `requireAuth`. That closes the data path, but a future purpose that carries a `sub` would be confused the same way. The audience check is one extra option and fixes the class.

### D2. Keep one signing secret

With audiences enforced in both directions, a separate secret per purpose adds environment configuration and a coordinated rollout without closing anything further. Add one if a purpose ever needs independent rotation.

### D3. No compatibility window for tokens without an audience

Accepting old tokens for their 15-minute life would leave the bypass's shape in place unless a separate subject check carried the risk. The web client recovers from a 401 through its existing refresh, so a clean cut is cheap. `/auth/me` is excluded from automatic retry (`docs/KNOWN_ISSUES.md` #006), but it is called only right after a token is issued.

### D4. Prove the fix against the real middleware

Tests fail on the unfixed code first. A route-level test confirms that other-purpose tokens get 401 from a protected module and that the response contains no rows. Unit tests cover each claim rule.

## Risks / Trade-offs

- [The fix becomes public before it is live, because the repository is public] → Keep the commit message neutral, and merge and deploy in one short window.
- [A held planning commit leaks through the hotfix branch] → Branch from `origin/main`, not from a local `razs_ai` that holds the unpushed security planning commit.
- [Past use can't be ruled out] → `morgan` records neither the token nor the user. Task 4 reviews logs for suspicious sequences, but a clean review is not proof of no use.
- [Rollback reopens the vulnerability] → Roll back only for a production outage, and redeploy the fix immediately after.

## Migration Plan

**Deployment order:** first in the initiative, depends on nothing, and blocks nothing else from being reviewed.

1. Merge the fix to `main`; the existing workflow deploys API and web together.
2. Verify, from task 3, without any test against real user data.
3. Run the log review in task 4.

**Compatibility:** tokens issued before deployment get one 401 and a silent refresh. No schema or environment change.

**Rollback:** revert the commit and deploy. Old code ignores the new audience, so tokens issued in the meantime keep working. No data migration is involved.
