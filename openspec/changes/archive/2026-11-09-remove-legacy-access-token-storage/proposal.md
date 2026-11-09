# Proposal

## Why

Browsers that used FlowLedger before 2026-08-10 still hold an access JWT in `localStorage["flowledger.token"]`. Commit `a8ae056` moved the access token into memory but never deleted the old key, so it stays visible to DevTools and to any script running on the origin. The token is expired, and the API rejects it because it has no audience (S-001). It still carries the user's id and email, and leaving it there makes it look as if the app stores credentials.

## What Changes

- On each page load, the web app deletes the legacy `flowledger.token` key from `localStorage`. If storage is unavailable, it moves on without an error.
- Nothing else changes. Today's architecture already matches the target:
  - The access token lives only in memory and is short-lived (`JWT_EXPIRES_IN`, default 15m).
  - A reload restores the session through the HttpOnly refresh cookie, which is host-only on the API.
  - No token appears in a URL (S-004).
  - The server authorizes every request.

## Capabilities

### New Capabilities

### Modified Capabilities
- `session-persistence`: adds that no access token is persisted in browser storage, and that the legacy stored token is removed.

## Impact

- `apps/web/src/hooks/useAuth.tsx` and its test.
- No API, schema, cookie or migration changes. Users stay signed in, because nothing reads the legacy key.
