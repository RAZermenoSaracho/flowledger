# Proposal

## Why

Google sign-in links to any existing account with the same email, and registration and email changes never prove that the address belongs to the user. Someone can therefore hold a password on an account that the real address owner later enters through Google, and both keep access to the same financial records. Separately, auth endpoints have no rate limits, the refresh cookie reaches every `razs.dev` application, and replayed refresh tokens raise no alarm.

## Findings

Evidence is from production `main` at `9d57822`; `razs_ai` has an identical tree. Status is confirmed from code unless noted.

| ID | Severity | Confidence | Trust boundary | Finding and evidence | Impact |
|---|---|---|---|---|---|
| F-02 | High | High | Google identity to local account | Auto-link by email keeps any earlier password and sessions: `auth/providers/google/services/create.service.ts:49-70`. Registration has no ownership proof: `auth/services/create.service.ts:20`. | Shared control of one account |
| F-03 | Medium | High | Access token to account identity | Email changes need no current password or session revocation: `users/services/update.service.ts:27-48`. | Stolen token changes login identity; also feeds F-02 |
| F-04 | Medium | High | Internet to `/auth/*` | No limiter on login, register, or refresh: `auth/auth.routes.ts:16-19`. Limiters exist only on `/v1` and `/mcp`. `docs/KNOWN_ISSUES.md` #007. | Credential stuffing and bcrypt CPU use |
| F-05 | Medium | High (live config read) | FlowLedger to sibling `razs.dev` apps | Refresh cookie has `Domain=.razs.dev`: `auth/utils/refreshTokenCookie.ts:39`. The zone also serves Odoo, n8n, and other apps. | A compromised sibling can receive the token on `/auth` paths |
| F-06 | Medium | High | Stolen refresh token | No replay response after a token is superseded: `auth/services/update.service.ts`. `docs/KNOWN_ISSUES.md` #007. | A thief and a victim can trade rotations until the victim is shut out |
| F-07 | Low | High | Internet to login | Bcrypt is skipped for unknown users: `auth/services/read.service.ts:16-18`. | Timing reveals registered emails |
| F-08 | Low | High | User to client | Failed logout leaves session state unclear: `apps/web/src/hooks/useAuth.tsx:98`. `docs/KNOWN_ISSUES.md` #031. | User wrongly believes they signed out |
| F-09 | Low | High | Data hygiene | Refresh rows are never deleted. `docs/KNOWN_ISSUES.md` #029. | Stale records and table growth |
| F-10 | Defense in depth | Medium | Sibling origin to `/auth/*` | No `Origin` check on session routes; same-site siblings satisfy `SameSite=Strict`. | Forced rotation or logout |

## What Changes

- **BREAKING (behavior):** Google sign-in no longer links automatically by email. A first Google sign-in whose email already has an account is refused, with guidance.
- Signed-in users can link Google explicitly from Profile, and that flow never issues a new session.
- Email changes move to `PATCH /auth/email`, require the current password, and atomically revoke the user's other sessions. Password-less accounts cannot change email. **BREAKING (internal):** `PATCH /users/me` no longer changes email; the web app is the only caller.
- `/auth/*` session routes get rate limits and an `Origin` check.
- Replaying a superseded refresh token revokes everything issued from it, after a short grace period.
- The refresh cookie becomes host-only. The non-secret presence cookie keeps its domain so the gateway can read it.
- Login runs bcrypt for unknown users; failed logouts report clearly; expired refresh rows are cleaned up.

## Scope and non-goals

Non-goals, each logged in `docs/KNOWN_ISSUES.md`: email verification and password reset (no mail code exists), an account-squatting remedy that depends on them, removing register's 409, revoking API keys and OAuth grants on password change, and `__Host-` cookies (they require `Path=/`, which would send the refresh token on every request).

## Capabilities

### New Capabilities
- `account-identity`: How sign-in methods attach to accounts, how email changes, and how authentication endpoints resist abuse.

### Modified Capabilities
- `session-persistence`: Refresh replay response, refresh-cookie scope, and failed-logout behavior.

## Impact

- **API:** `apps/api/src/modules/auth/`, `apps/api/src/modules/users/`, `apps/api/src/utils/rateLimit.ts`, plus a new `POST /auth/google/link` and `PATCH /auth/email`.
- **Web:** `apps/web/src/hooks/useAuth.tsx`, `apps/web/src/services/auth.client.ts`, `apps/web/src/pages/Login/`, `apps/web/src/pages/Profile/`.
- **Shared:** `packages/shared/src/schemas/auth.ts`.
- **Data:** no migration. **Dependencies:** none; `express-rate-limit` is already installed.
- **Docs:** `docs/AUTH_FLOW.md`, `docs/KNOWN_ISSUES.md`.
