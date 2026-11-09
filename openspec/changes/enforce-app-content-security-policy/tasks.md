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
- [ ] 2.3 Manual (owner, before production): open Accounts → add account, and connect or resync a bank through the Syncfy widget; the OAuth callback after Google sign-in, Google sign-in, MCP consent, and the installed PWA on iOS, with no blocked-resource errors.

## 3. Docs

- [x] 3.1 Update `docs/KNOWN_ISSUES.md` #046 and the roadmap.
