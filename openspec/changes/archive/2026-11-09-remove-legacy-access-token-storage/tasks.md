# Tasks

## 1. Implementation

- [x] 1.1 Remove `localStorage["flowledger.token"]` through `clearLegacyStoredToken` in `auth.client.ts`, called from `AuthProvider`'s mount effect and guarded by try/catch. Verify: `useAuth.test.tsx` covers that the key is removed and that the session still restores. `auth.client.test.ts` covers that other keys are kept and that blocked storage doesn't throw.
- [x] 1.2 Assert that restore and login never write a token to `localStorage` or `sessionStorage`. Verify: a `useAuth.test.tsx` case.

## 2. Verification

- [x] 2.1 Web typecheck, lint, and the `useAuth` and api client tests pass.
- [ ] 2.2 After deploy, production smoke test in a headless browser: seed the legacy key, load the app, and confirm the key is gone. Also confirm that `/auth/refresh` without a cookie returns 401 and the API health check returns 200.

## 3. Docs

- [x] 3.1 `docs/AUTH_FLOW.md` notes the legacy key cleanup. The roadmap lists the change.
