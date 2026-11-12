# Tasks

## 1. Implementation

- [x] 1.1 Add the enforced CSP to `preview.headers` in `apps/web/vite.config.ts`, with the API origin taken from `VITE_API_URL`. Verify: `src/tests/contentSecurityPolicy.http.test.ts` asserts that the preview response carries the policy and that `script-src` has no `'unsafe-inline'` or `'unsafe-eval'`.

## 2. Verification

- [x] 2.1 Web typecheck, lint and tests pass.
- [x] 2.2 Staging walkthrough on a preview build against the staging API, in a headless browser:
  - Register, log out, log in, and visit every app page and the OAuth authorize page.
  - Record zero CSP violations.
  - Confirm that an injected inline script and an inline handler are blocked.
  - Result (2026-11-09): zero violations across register, logout, login, reload and ten app routes. An inline script, an inline handler, a remote script and `eval` in a same-origin script were all blocked. No auth values in web storage, and no cookies visible to `document.cookie`.
- [x] 2.3 Production check after deploy, in a headless browser, signed out:
  - Confirm the enforced header on app routes, and that the landing root stays report-only.
  - Load `/login`, `/register`, `/dashboard` and `/oauth/authorize` and record CSP violations.
  - Check the API health, refresh, Google start and MCP endpoints.
  - Result (2026-11-09): the first pass found the Cloudflare Web Analytics beacon blocked, which #37 allowed. After that: zero enforced violations, no page errors, the beacon loads, and the endpoints respond as expected.
  - Owner checks that need personal credentials are tracked in `docs/KNOWN_ISSUES.md` #046: a Syncfy bank connection or resync, signed-in Google, MCP consent, and the iOS PWA.

## 3. Docs

- [x] 3.1 Update `docs/KNOWN_ISSUES.md` #046 and the roadmap.
