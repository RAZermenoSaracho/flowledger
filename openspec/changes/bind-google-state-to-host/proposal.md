## Why

Odoo task #189. The Google OAuth state is a signed JWT whose `nonce` must equal the cookie `flowledger_google_oauth_state` (`auth/providers/google/utils/googleStateCookie.ts`, checked in `handleGoogleCallback`). The cookie is `Path=/auth/google/callback`, host-only when set by the API, but it is not host-locked: any sibling subdomain of `razs.dev` can set a cookie with `Domain=razs.dev` and the same name and path, and the browser then sends it to `api-flowledger.razs.dev`.

Login CSRF attack (sign-in mode, which task #163 left unchanged):

1. The attacker starts Google sign-in, completes consent with their own Google account, and captures the callback URL (`code` and `state`) without following it. The state JWT payload is readable, so the attacker knows its `nonce`.
2. From a controlled sibling subdomain, the attacker plants `flowledger_google_oauth_state=<nonce>` with `Domain=razs.dev; Path=/auth/google/callback` in the victim's browser, then sends the victim to the callback URL.
3. The nonce check passes, the callback issues a session for the attacker's account, and the victim keeps entering financial data into it.

Assessment: real, but it needs control of a sibling subdomain (or an XSS there) and a victim navigation within the 10-minute state lifetime and before the code is used. The impact is high (data lands in the attacker's account), so the fix is worth doing, and it is small. PKCE or a second binding value would not help, because the attacker can plant any cookie value. The binding must live in a cookie a sibling cannot set.

## What Changes

- On HTTPS deployments (the same condition that already adds `Secure`), the state cookie is named `__Host-flowledger_google_oauth_state` with `Secure; Path=/`, and no `Domain`. Browsers refuse to store a `__Host-` cookie that carries `Domain` or is set from another host, so a sibling subdomain cannot plant it.
- On plain-HTTP development (`http://localhost`), the cookie keeps its current unprefixed name and `Path=/auth/google/callback`, because `__Host-` requires `Secure`, which Safari does not honor on HTTP localhost. There is no sibling-subdomain exposure on localhost.
- The callback reads only the name that matches the deployment mode. It never falls back to the unprefixed name when the prefixed one is expected, so a planted legacy-named cookie is ignored.
- The set and clear helpers use the same name and attributes; the clear cookie sets `Max-Age=0` with identical attributes.
- Link flow and sign-in share the cookie, so both are fixed. In-flight sign-ins at deploy time fail once with the existing generic error and can be retried.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `google-sign-in-callback`: adds a requirement that the sign-in nonce cookie cannot be planted from another subdomain.

## Impact

- API: `auth/providers/google/utils/googleStateCookie.ts` (name and attributes), its test, `controllers/create.controller.ts` (no change expected beyond the shared helpers), `services/create.service.ts` (reads the name via the helper), and their tests.
- Docs: `docs/AUTH_FLOW.md` (cookie name, path, and the planted-cookie note in the Google section).
- No database migration, no new dependency, no new env var, no web change.
