## Why

Odoo task #163 (KNOWN_ISSUES #045 item 2). In link mode, the Google callback (`apps/api/src/modules/auth/providers/google/services/create.service.ts`, `handleGoogleCallback` → `completeLink(state.linkUserId, …)`) links the chosen Google identity to `state.linkUserId` after checking only that the state nonce matches the nonce cookie. Nothing proves that the browser finishing the callback belongs to that user. Suppose an attacker plants their own nonce cookie from a sibling subdomain (cookie tossing onto `Path=/auth/google/callback`) and gets a victim to open the attacker's Google consent URL. The victim's Google identity is then linked to the attacker's account. Later, when the victim signs in with Google, they land in the attacker's account.

The callback path itself carries no session evidence:

- The refresh cookie is `SameSite=Strict`, so the browser does not send it on the navigation that Google's redirect starts. It is also host-only with `Path=/auth`.
- The presence cookie (`flowledger_session`) is `SameSite=Lax` but holds no credential.
- The access token lives only in the web app's memory, and a navigation never sends it.

Binding therefore has to happen on a request that does carry a session.

## What Changes

- In link mode, the callback no longer creates the link. After the nonce check, it exchanges the code and verifies the Google identity as before. It then stores the result in a short-lived signed "pending link" cookie that holds `linkUserId` and the Google identity, and redirects to `/profile?tab=security&googleLink=pending`. Cancellation and exchange errors still redirect with `googleLink=failed` and set no pending cookie.
- New `POST /auth/google/link/complete`, behind `requireWebOrigin` and `requireAuth`. It verifies the pending cookie, and creates the link only when the bearer token's user equals the pending `linkUserId`. It always clears the cookie. A missing, invalid, or expired cookie, or a user mismatch, gets a generic 400 and links nothing.
- On `googleLink=pending`, the web Profile Google section calls the completion endpoint once (after session restore), shows the result through the existing `connected | conflict | failed` messages, and refreshes the link status.
- Google sign-in and registration (non-link mode) are unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `account-identity`: "Linking Google requires the signed-in account" now requires the link to complete only on a request authenticated as the same user who started it.

## Impact

- API: `auth/providers/google/services/create.service.ts`, `controllers/create.controller.ts`, `google.routes.ts` (the new route with `requireWebOrigin` and `requireAuth`), the existing `utils/googleState.ts` and `utils/googleStateCookie.ts` (pending-link token and cookie helpers), `types/google.types.ts`, `auth/tests/auth.routes.test.ts`, and the matching tests.
- Web: `services/auth.client.ts`, `services/api.client.ts` (add the completion path to `ACCESS_TOKEN_AUTH_PATHS`), `pages/Profile/components/GoogleSection.tsx`, and their tests.
- Docs: `docs/AUTH_FLOW.md`, the Google link section.
- No database migration, no new dependency, no new env var.
