# Tasks

Work on a feature branch from the latest `razs_ai`; one PR targets `razs_ai`. Every changed file under `controllers/`, `services/`, `utils/`, `hooks/`, or `components/` gets its matching test. Read `docs/TESTING.md` first.

## 0. Pre-implementation check (needs the owner)

- [ ] 0.1 On the phone where logouts occur, note how FlowLedger is opened (`/`, a bookmark, or a home-screen icon), and whether that browser has also used the dev site. Optionally run the read-only production query in `design.md`. Verify the answers are recorded in the PR, and that they don't reveal a cause outside this design.

## 1. ST-004: Palette

- [x] 1.1 Add `apps/web/src/constants/darkPalette.ts` with the design D1 scale, plus `constants/tests/darkPalette.test.ts`. Verify the test asserts equal RGB channels on every step, at least 4.5:1 for steps 100 to 500 on 950, 900, and 800, and lightness ordering 950 < 900 < 800.
- [x] 1.2 Back `slate` with CSS variables in `tailwind.config.ts`, using an inline plugin with `:root` values from `tailwindcss/colors`. Verify with a built-CSS check that `.dark:bg-slate-900/95`, `ring-offset-slate-950`, and `shadow-slate-700` resolve to the variable, that `:root` equals Tailwind's `slate`, and that `.dark` is emitted after `:root`.
- [x] 1.3 In `index.css`, replace `#020617` and `#e2e8f0` with `theme()` slate references, and add the D2 Recharts rules. Verify `#020617` no longer appears in `apps/web/src`, and `npm run build -w apps/web` succeeds.

## 2. ST-004: Visual verification

- [x] 2.1 On throwaway instances (API 4099, web 5175), screenshot Dashboard, Transactions, Reports, Profile, and Login in both themes at 390px and 1440px. Verify dark surfaces are neutral, surfaces are distinct, and chart tooltips and axes are readable. Grep for `text-slate-600` to `950` without a `dark:text-` pair, and verify any rendered result meets AA.
- [ ] 2.2 Verify native selects and `datetime-local` popups in dark mode on desktop Chrome, and mobile Safari through the §8 device pass. Compare light-mode screenshots with `razs_ai` and verify no visible change.

## 3. ST-002: Data model and tokens

- [x] 3.1 Add `persistent Boolean @default(true)` and `previousTokenId String?` to `RefreshToken`, through a Prisma migration. Verify `npm run prisma:generate` and `npm run typecheck` pass and the migration is additive.
- [x] 3.2 Add `keepLoggedIn` to `loginSchema` (default `true`) and `googleOAuthStartQuerySchema` (optional `"true"` or `"false"`), with tests in `packages/shared`. Verify omitted, true, and false values parse as designed, including the string `"false"` meaning false.
- [x] 3.3 Make `generateRefreshToken` and `issueRefreshToken` take a mode and optional predecessor. Verify in tests that the expiry is 30 days or 24 hours and the row stores both fields.
- [x] 3.4 In `refreshTokenCookie.ts`, add environment-specific names, the presence cookie, and omission of `Max-Age` for session mode. Verify in `refreshTokenCookie.test.ts`: production names unchanged, `Path=/; SameSite=Lax` on presence with no token data, and matching clear behavior. Update the `register`, `login`, `refresh`, `logout`, and Google callback controllers and their tests to send both cookies.

## 4. ST-002: Rotation, logout, and password

- [x] 4.1 Implement D4 in `rotateRefreshToken` and update the refresh controller. Verify service tests: replay before successor use succeeds, replay after returns 401, a revoked or expired token returns 401, the mode is carried over, and expiry slides.
- [x] 4.2 Implement D5 in `revokeRefreshToken`. Verify tests: the token, predecessor, and tokens issued from it are revoked, a null-predecessor token revokes only itself, a stale already-revoked cookie still revokes its predecessor, and another device survives.
- [x] 4.3 Pass the mode through `authenticateUser`, `registerUser` (always persistent), and the Google start, state, and callback flow. Verify service and controller tests, including a state without `keepLoggedIn` meaning `true`.
- [x] 4.4 Mount password change at `PATCH /auth/password` per D6, keeping the controller and service in `users`. Change the wrong-password status to 400. Update `users.routes.test.ts`, `update.controller.test.ts`, and the `update.service` tests. Verify: others revoked and the current token kept in one transaction, wrong password returns 400 and changes nothing, no cookie revokes all, and the old route returns 404.
- [x] 4.5 Extend `apps/api/src/modules/auth/tests/` route coverage on Postgres (Docker VM required) for register, login in both modes, lost-response replay, concurrent refresh, logout, and password change. Verify the suite passes with real `Set-Cookie` headers.

## 5. ST-002: Web

- [x] 5.1 In `api.client.ts`, add `ApiError.status`, end sessions only on a refresh 401, and add the `/auth/password` retry exception. Verify with msw: network error and 502 keep the token and don't call the handler; 401 does; an expired token on password change refreshes and retries.
- [x] 5.2 In `auth.client.ts`, `useAuth`, and `ProtectedRoute`, implement D7's three results, retry, and connection message. Verify with msw and fake timers: 502 then 200 renders the page with no login, 401 redirects, a network `TypeError` counts as unavailable, and timers clear on unmount.
- [x] 5.3 Add the checkbox and signed-in redirect to `LoginPage`, pass `keepLoggedIn` from `LoginPage` through `GoogleOAuthButton`, and point `users.client.updatePassword` at the new route, updating the Profile msw handlers for `/users/me/password`. Verify tests: checked by default, value sent in login and Google URL, and a signed-in user is redirected without seeing the form.

## 6. Documentation

- [x] 6.1 Correct root `CLAUDE.md` (`JWT_EXPIRES_IN` default `15m`, replace "No session cookies" with the access-token and refresh-cookie model) and `apps/web/CLAUDE.md` (`ProtectedRoute`, auth context). Verify by grep that `7d` and "No session cookies" are gone.
- [x] 6.2 Update `docs/AUTH_FLOW.md` (modes, rotation, presence cookie, env names, password route, the incorrect gateway claim) and `docs/DATA_MODEL.md`. Verify each spec requirement maps to documented behavior.
- [x] 6.3 Update `docs/KNOWN_ISSUES.md`: annotate #007 with the new rotation rule, and log refresh-token row growth and the pre-mount theme flash. Verify the entries exist, and that #007 stays open.

## 7. Verification

- [x] 7.1 Run `npm run typecheck`, `npm run lint`, and `npm run test`, including integration suites with the Docker VM. Verify all pass and coverage thresholds hold.
- [x] 7.2 Repeat the discovery repro on throwaway instances: curl replay, concurrent, password, and logout; Playwright boot and mid-session failures. Verify V2 to V5 and V7 no longer reproduce. Remove test users afterward.
- [x] 7.3 Run the `security-auditor` agent on the auth diff and resolve its findings.
- [ ] 7.4 When the dev API is next running, inspect a login response and verify its `Set-Cookie` uses the `flowledger_dev_*` names. If it does not, stop and report, since D8 then needs another signal.

## 8. Device verification (needs the owner's devices, after a deploy the owner approves)

- [ ] 8.1 Run on iPhone Safari, the iPhone home-screen icon, Android Chrome, and desktop Chrome, with the option checked and unchecked: close and reopen, reopen after over 15 minutes, reopen after over 24 hours, airplane-mode reopen, and logout. Record results in the PR. Verify checked sessions survive and unchecked sessions end after 24 hours.
- [ ] 8.2 If a logout still occurs, capture the device, launch path, and whether the cookie exists, then report it before adding any fix. Verify H1 to H3 are each marked confirmed or ruled out.

## 9. Separate delivery, needs explicit approval

- [ ] 9.1 In `flowledger_landing/server/gateway.js`, change the cookie constant to `flowledger_session` and deploy after the API. Verify in a browser that `/` shows the app when signed in and the landing page when signed out.
