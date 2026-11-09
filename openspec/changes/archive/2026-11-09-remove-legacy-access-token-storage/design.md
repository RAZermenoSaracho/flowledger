# Design

## Context

The token store in `api.client.ts` keeps the token only in memory. `AuthProvider` restores the session on mount by calling `/auth/refresh` with the HttpOnly refresh cookie. The legacy key is written by no current code, and the API rejects its value: the token has no `aud` and is long expired.

## Goals / Non-Goals

**Goals:** remove the stale key from every browser that still has it, without signing anyone out.

**Non-Goals:**
- A BFF, token versioning, or changes to the refresh cookie or presence cookie.
- Clearing other storage such as UI preferences or third-party widget storage. Those aren't credentials.

## Decisions

- **Remove in `AuthProvider`'s mount effect, before the session restore.** That effect runs once per page load and already owns session bootstrap, and it's testable.
  - Alternative: module scope in `api.client.ts`. That's a side effect at import, harder to test.
  - Alternative: `main.tsx`. It's bootstrap code, excluded from tests.
- **Wrap it in try/catch.** `window.localStorage` throws a SecurityError when site data is blocked, and that must not break sign-in.
- **Keep it permanently.** It's one line, and browsers with the key can return at any time, for example an installed PWA opened after months.

## Risks / Trade-offs

- [The removal runs on every load] → `removeItem` on a missing key is a no-op and costs nothing.
- [An XSS could still read the in-memory token while the page is open] → inherent to SPAs. The 15-minute lifetime, the S-001 audience check, and the HttpOnly refresh cookie, which scripts can't read, limit the impact. CSP enforcement is tracked in KNOWN_ISSUES #046.

## Migration Plan

Deploy with the normal `razs_ai` → `main` promotion. Rollback is a revert. No data or session impact.
