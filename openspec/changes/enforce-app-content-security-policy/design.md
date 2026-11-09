# Design

## Context

What the 2026-11-09 investigation found:

1. **No exploitable XSS was found.**
   - There are no `dangerouslySetInnerHTML`, `innerHTML` or `eval` sinks in app code, and no inline scripts in `index.html`.
   - No `href` or `src` is built from user data.
   - React escapes rendered output.
   - The risk is what an XSS could do if one landed, for example through a dependency.
2. **Script on the origin can obtain an active access token**, from memory or simply by calling `POST /auth/refresh`, which returns a fresh token to any script on the web origin. It cannot read the refresh token, which is HttpOnly.
3. **Making credentials unreadable to JavaScript is possible but costly.** It would need an HttpOnly access cookie checked on every API route, the refresh endpoint no longer returning a token, and changes to every client request.
4. **A cookie session would not be the simplest appropriate fix.**
   - The API is on a separate host, so cookies would only be safe with SameSite plus CSRF checks.
   - SameSite does not separate the other `razs.dev` apps (Odoo, n8n and others). They are same-site, so every state-changing route would need Origin checks or CSRF tokens. Today only `/auth/*` has `requireWebOrigin`.
5. **The CSRF a cookie design would need:** an Origin allowlist on every non-GET route, or double-submit tokens. Bearer tokens need neither.
6. **Yes, XSS can act without the token** in any design: injected script calls the API with the user's credentials. In this app it could also approve an MCP consent for an attacker-hosted CIMD client, which yields a long-lived MCP grant. Cookie storage changes none of this. It only stops the attacker from taking a token of up to 15 minutes off the device.
7. **Server-side checks hold.**
   - Every route uses `requireAuth`. Ownership is enforced in Prisma `where` clauses, and the sieve field guard applies (S-001 and S-003).
   - Changing the email requires the current password.
   - Google linking is bound to a state cookie.
   - The MCP OAuth consent page requires a web access token.
8. **Smallest meaningful change:** enforce a CSP on application pages. It blocks the common XSS payload classes (inline script, event handlers, scripts from attacker hosts) without touching authentication.

## Goals / Non-Goals

**Goals:** an enforced, script-restricting CSP on application pages that keeps sign-in, OAuth, MCP consent and Syncfy working.

**Non-Goals:**
- A cookie-only session, BFF or CSRF tokens. See Context 3–6.
- Changing the landing pages' CSP.
- Step-up re-authentication on MCP consent. It's recorded as a residual risk.

## Decisions

- **Set the policy in `vite.config.ts` `preview.headers`.** Production serves the app with `vite preview` behind the gateway. The gateway's report-only header still covers the landing pages. Alternatively the gateway could enforce it, but it doesn't know each environment's API origin, and the app should own its policy. The dev server gets no CSP, because HMR needs inline scripts and WebSockets.
- **Directives:**
  - `script-src 'self' https://www.paybook.com https://www.googletagmanager.com`, with no `'unsafe-inline'` and no `'unsafe-eval'`. The widget's `eval` exists only in a Node `vm` shim that browsers don't call.
  - `style-src 'self' 'unsafe-inline'`. Vue, Element Plus and React inject style attributes.
  - `connect-src 'self' <API origin> https: wss:`. The widget's socket host comes from the Syncfy API at runtime, and `connect-src` doesn't stop exfiltration anyway (navigation and images do).
  - `img-src 'self' <API origin> https: data: blob:`. This covers bank logos from `s.paybook.com`.
  - `font-src 'self' data:` and `frame-src 'self' https:`.
  - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` and `frame-ancestors 'none'`.
- **Derive the API origin from `VITE_API_URL`,** the same value the bundle uses, so each environment gets the right policy.

## Risks / Trade-offs

- [The Syncfy widget needs a blocked source] → staging walkthrough, a manual bank-connection test before production, and rollback by removing the header.
- [`https:` in connect-src, img-src and frame-src] → these don't control script execution, which is the protection that matters here.
- [An XSS could still use the session or approve an MCP consent] → CSP makes it much harder for injected code to run. A new grant is visible in Connected apps and can be revoked there.

## Migration Plan

Merge to `razs_ai` and validate on staging with a preview build. Promote to `main` only after the owner's approval and a successful manual Syncfy test. Rollback: revert the commit, or drop the header.
