## Context

The state cookie is the only browser binding on the callback: the state JWT is signed but readable, so an attacker who captured their own callback URL knows the nonce. The cookie is unprefixed, so a sibling subdomain can set it with `Domain=razs.dev`. The refresh and presence cookies are not usable as binding: the refresh cookie is `SameSite=Strict` and absent on the cross-site return, and the presence cookie holds `1`.

## Goals / Non-Goals

**Goals:** a sign-in or link callback succeeds only in the browser whose API host set the nonce cookie. A cookie planted from a sibling subdomain is ignored. Works on desktop browsers, mobile Safari and Chrome, and the installed Home Screen app. Plain-HTTP local development keeps working.

**Non-goals:** PKCE (it protects the code exchange, not the browser binding, and the attacker can plant any cookie); changing the refresh cookie; a server-side nonce store; protecting `http://` deployments from sibling-domain planting (impossible without a host-locked cookie).

## Decisions

**D1 — `__Host-` prefixed nonce cookie on HTTPS.** Browsers accept a `__Host-` cookie only when it is `Secure`, has `Path=/`, has no `Domain`, and is set over a secure connection by that exact host. A sibling cannot set it for the API host. This is the smallest correct fix: one name and attribute change, no new state, no new dependency. Alternatives rejected: a binding nonce echoed in a second cookie (also plantable), PKCE (same planting problem), a server-side store keyed by a cookie (still needs an unforgeable cookie).

**D2 — Prefix only when `secureAttribute()` is non-empty.** `Secure` is already derived from production or an `https://` `WEB_APP_URL`. The name is computed from the same condition, so prefix and `Secure` cannot disagree. `http://localhost` development keeps the unprefixed name and the callback path, because Safari rejects `Secure` cookies on HTTP localhost and Chrome-only support is not enough. Staging (`flowledger-dev.razs.dev`) is HTTPS, so it exercises the prefixed path.

**D3 — `Path=/` is required and acceptable.** The cookie is `HttpOnly; SameSite=Lax`, so it is sent on the top-level GET from Google, and it is also sent to other API paths, which ignore it. It is cleared by the callback on every outcome, and expires after 10 minutes.

**D4 — No fallback read.** The callback reads exactly one name for the current mode. Reading the legacy name would reintroduce the planted-cookie path. The only cost is that sign-ins in flight during deploy fail once with the existing generic message.

**D5 — Clearing.** `googleStateCookie("", 0)` emits the same name and attributes with `Max-Age=0`, which browsers require to match for the delete to apply.

**Browser notes.** `__Host-` is supported in Safari 12+, Chrome 49+, and Firefox 50+. Installed Home Screen apps behave as today: if the OS opens the callback in a context without the cookie, sign-in fails with the existing generic error; this change does not alter that, and the spec scenario for it stays as written.

## Risks / Trade-offs

- A sibling subdomain can still delete or shadow nothing relevant: it cannot set the prefixed name, and a missing cookie only fails the sign-in.
- If a deployment uses an HTTPS `WEB_APP_URL` but the API is reached over HTTP, the `Secure` cookie is never stored. This is already true of the current `Secure` attribute.
- Local HTTP dev is unprotected against planting by design; no sibling domains exist there.

## Migration Plan

No data change. Deploy; in-flight sign-ins at deploy time retry. The old cookie expires on its own within 10 minutes and is ignored.

## Open Questions

None blocking. See Owner decisions in `tasks.md`.
