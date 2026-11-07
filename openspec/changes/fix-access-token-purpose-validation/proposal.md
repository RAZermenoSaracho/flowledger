# Proposal

## Why

`requireAuth` accepts any JWT signed with `JWT_SECRET`, whatever it was issued for, and does not require a subject. Other purposes share that secret, and one of those tokens is issued before login. A token with no subject leaves `req.user.id` undefined, and Prisma drops undefined `where` fields, so owner scoping can silently disappear on reads and writes. This is the highest-priority fix in the security-hardening initiative and ships alone, ahead of everything else.

## Findings

| ID | Severity | Confidence | Status | Trust boundary | Component |
|---|---|---|---|---|---|
| F-01 | Critical | High | Confirmed from code, plus synthetic library checks; not exercised against a running FlowLedger instance | Internet to authenticated API | `requireAuth`, every route behind it |

**Evidence** (production `main` at `9d57822`; `razs_ai` has an identical tree):

- `apps/api/src/middleware/auth.ts:22` calls `jwt.verify(token, env.JWT_SECRET)` with no options and sets `req.user` from the payload on the next line, with no `sub` check.
- `apps/api/src/modules/auth/providers/google/utils/googleState.ts:8` and `apps/api/src/modules/oauth/utils/consentRequest.ts:10` sign other purposes with the same secret and no subject.
- `apps/api/src/modules/auth/providers/google/controllers/create.controller.ts:19` issues the state token without authentication.
- `jsonwebtoken` 9.0.3 checks `aud` only when the verifier asks (`verify.js:194`). A synthetic check with a made-up secret accepted both token shapes with `sub` undefined.
- Prisma 6.19.3 has no `strictUndefinedChecks` here. A synthetic SQLite check showed `findMany` and `updateMany` with `where: { userId: undefined }` affecting every row.
- Examples of affected queries: `notifications/services/read.service.ts:6` and `notifications/services/update.service.ts:5` (unbounded), `transactions/services/update.service.ts:28`, `transactions/services/delete.service.ts:7`, and `shared-expenses/services/read.service.ts:116` (bounded only by a client-chosen id). Some paths fail closed, because `findUniqueOrThrow({ where: { id: undefined } })` throws (`debts`, `reports`, `users`).

**Practical impact:** an unauthenticated visitor may be able to read and change other users' financial records. The running application was deliberately not tested.

## What Changes

- Access tokens carry an explicit audience, and verification requires that audience, HS256, a non-empty string subject, and a string email.
- `requireAuth` delegates to one verifier next to `signAccessToken`, so signing and verification rules live together.
- Google state and OAuth consent verification also pin HS256.
- Regression tests prove that tokens for other purposes and tokens without a subject are rejected.

## Scope and non-goals

In scope: access-token signing and verification, and the two other JWT verifiers.

Non-goals: separate signing secrets, token versioning, per-request database checks, per-service `userId` assertions, Prisma `strictUndefinedChecks` (a preview flag that would break the optional-field `undefined` pattern across services), and any other finding from the initiative.

## Capabilities

### New Capabilities
- `access-token-validation`: Which tokens authenticate a web API request, and how every other token purpose is refused.

### Modified Capabilities

None.

## Impact

- **Code:** `apps/api/src/middleware/auth.ts`, `apps/api/src/modules/auth/utils/tokens.ts`, `apps/api/src/modules/auth/providers/google/utils/googleState.ts`, `apps/api/src/modules/oauth/utils/consentRequest.ts`, and their tests.
- **API:** no contract change. Access tokens issued before deployment get one 401, and the web client recovers through its existing silent refresh.
- **Data, dependencies, environment:** none.
- **Docs:** `docs/AUTH_FLOW.md`.
