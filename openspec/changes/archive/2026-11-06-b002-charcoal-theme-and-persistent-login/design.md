# Design

## Context

See `proposal.md` for motivation. The evidence below was gathered on 2026-11-06.

**Theme.** Tailwind v3.4 with `darkMode: "class"`. About 400 `dark:*-slate-*` uses and 378 non-dark `slate` uses. No `dark:` blue, gray, or arbitrary colors. `useTheme` already sets `color-scheme`. All three Recharts charts use the default white tooltip and default axis color.

**Auth.** Access JWT 15 minutes in memory. Refresh token 30 days, hashed, rotated on every use, in an `HttpOnly; SameSite=Strict; Path=/auth; Domain=.razs.dev` cookie. There is no service worker, manifest, or `apple-mobile-web-app-*` tag.

### Verified defects

| # | Finding | Evidence |
|---|---|---|
| V1 | Opening `/` with a valid session shows the landing page, and its "Log in" link goes to a `/login` form that ignores the valid session | Live production browser probe with a fake context-only cookie: `Path=/auth` got the landing page, `Path=/` got the app. `gateway.js` checks the cookie only on `/`. `LoginPage` has no signed-in check |
| V2 | Network error or 502 on the boot refresh goes to `/login`; a reload recovers | Playwright on a throwaway instance, both cases |
| V3 | Network error during a mid-session refresh goes to `/login`; a reload recovers | Playwright. `refreshAccessToken` treats every failure as session end |
| V4 | Replaying a token after rotation returns 401, so a lost response ends the session permanently | curl: `first=200 replay=401` |
| V5 | Concurrent refreshes with one cookie partly fail | curl, 6 parallel: three 200, three 401 |
| V6 | Dev and production cookies collide: same name, path, and `Domain=.razs.dev`, different databases | Both `.env` files, non-secret keys only. By cookie rules, the same name, domain, and path replace each other; not run live because the dev API was down |
| V7 | Password change leaves other sessions alive | curl: `patch=204`, other-device refresh `200` |

Logout revocation works (`after-logout-refresh=401`).

### Not established

These defects are real, but **which one causes the reported mobile logouts is not proven**. No production data or device was examined.

- **H1:** Mobile Safari evicts or caps the cookie (ITP behavior). Unverified.
- **H2:** A home-screen launch uses a separate cookie jar, or opens at `/` and hits V1. Unverified on a device.
- **H3:** `SameSite=Strict` blocks the cookie on launch. Unlikely, since the fetch is same-site, and login from a cross-site Google redirect works, but untested on a device.
- **Roadmap prerequisite:** B-002 asks for the cause to be identified first. The defects are identified; attribution on the owner's phone is not. Task 0.1 is a pre-implementation check that needs the owner.
- **Likely dominant, unproven:** V1 for anyone opening the root URL, and V2/V3 around deploys, which restart the API with `pm2 restart`.

## Goals / Non-Goals

**Goals:** smallest diff that meets both specs, reusing the existing token design. **Non-goals:** see `proposal.md`.

## Decisions

### D1. Theme: CSS-variable `slate`

`theme.extend.colors.slate` maps each step to `rgb(var(--slate-N) / <alpha-value>)`. A small inline plugin writes `:root` from `tailwindcss/colors` and then `.dark` from `src/constants/darkPalette.ts`. The two selectors have equal specificity, so `.dark` must come second. A compile spike confirmed opacity modifiers, ring offsets, and shadow colors resolve correctly.

Taking light values from Tailwind itself makes transcription drift impossible.

**Rejected:** a codemod of `dark:*-slate-*` to `neutral` touches 400+ sites, leaves non-dark `slate` blue in dark mode, and lets new code reintroduce it. Overriding `slate` outright changes light mode. A semantic token system is a redesign.

Palette: `50 #f7f7f7, 100 #ededed, 200 #dedede, 300 #c8c8c8, 400 #b8b8b8, 500 #a0a0a0, 600 #5c5c5c, 700 #454545, 800 #333333, 900 #242424, 950 #181818`.

Computed contrast: step 500 on 800 is 4.84:1 and on 950 is 6.8:1. Surface steps are 1.14 (950 to 900) and 1.23 (900 to 800). The contrast test is the authority if values are tuned during visual review.

### D2. Charts: central CSS, no component edits

Add `.dark` rules in `index.css` for `.recharts-default-tooltip`, `.recharts-tooltip-label`, `.recharts-tooltip-item`, and `.recharts-cartesian-axis-tick-value`, with `!important` where Recharts sets inline styles. Tooltip item text becomes a neutral color in dark mode, because pine on charcoal is unreadable. Series fills keep their colors.

### D3. Session mode: one column, cookie follows it

`RefreshToken.persistent Boolean @default(true)`. Existing rows stay 30-day persistent. Rotation copies the flag. Unchecked uses a 24-hour server TTL (a constant, no new env var) and omits `Max-Age`.

The server TTL is the real bound on unchecked sessions, because mobile browsers and session-restore can keep session cookies indefinitely.

**Rejected:** a separate cookie or JWT claim for the mode can drift from the database and adds no value.

### D4. Rotation: predecessor dies when its successor is first used

`RefreshToken.previousTokenId String?`, no foreign key or index, since it is only read from the row in hand.

```
refresh(T):  T valid? (revokedAt null, not expired) else 401
             create N { previous: T.id, persistent: T.persistent }
             revoke T.previous, if any
```

T is no longer revoked at the moment of rotation. Replaying T is accepted until N is used, which covers V4 and V5 with no time window. Reordered responses are safe too: either sibling in the cookie works. Unused siblings have no holder and expire naturally. No transaction is needed: if the second step fails, the predecessor just lives until the next refresh.

**Rejected:**

- *Time-based grace, as in the OAuth `flr_` code (30 s):* a lost response is recovered when the device next has network, which can be hours later on mobile. A window long enough to cover that keeps superseded tokens valid after the client has proven it has the new one. OAuth clients are servers that retry immediately, so its window fits there.
- *Revoking the unused successor on replay:* a response reorder could leave a revoked token in the cookie and cause the logout this fixes.
- *Removing rotation:* the ticket requires it.

**Security.** A thief holding a current or not-yet-superseded token can refresh until the legitimate client moves on, which is no worse than stealing the current cookie, and the token is `HttpOnly`. Rotation's protection for already-superseded tokens stays. An idle device keeps T and N both valid, bounded by T's own expiry. There is still no reuse alarm; #007 stays open and can build on `previousTokenId`.

### D5. Logout scope

Look the token up by hash regardless of its revocation state, then revoke, scoped by `userId`: the token, its predecessor, and tokens issued from it (`previousTokenId = token.id`). The last clause covers a refresh in flight during logout, whose `Set-Cookie` could otherwise restore a live token after logout. It filters on a non-null id, so it can't match root sessions. `userId` keeps the query on the existing index.

Siblings from an earlier concurrent refresh are left to expire: their plaintext was overwritten or never delivered, so no client holds them.

### D6. Password change route moves to `/auth`

The cookie is only sent under `/auth`, so `/users/me/password` cannot identify the current device. Mount the existing `patchPassword` controller on `authRouter` as `PATCH /auth/password`, with `requireAuth` and the existing schema, and remove the `users` route. The controller and service stay in `users`; `v1` routes already reuse other modules' controllers this way. The web call stays in `users.client.ts` with a new path.

One `$transaction` updates the hash and runs `updateMany({ userId, revokedAt: null, tokenHash: { not: currentHash } })`, or revokes all when no cookie is present.

**Two `apiRequest` interactions:**

- It skips 401 refresh for every `/auth/*` path, so add `/auth/password` as an exception. Otherwise an expired access token would fail a password change.
- With that exception, a 401 for a wrong current password would trigger a pointless refresh, retry, and second bcrypt run. Return **400** for a wrong current password instead: the access token was fine, so 401 was the wrong status. The form already displays the message.

**Rejected:** widening the cookie to `Path=/` sends a credential on every API call. Logging the current device out contradicts "other sessions". A session id in the JWT changes every token and `requireAuth`.

**Residual:** other devices' access JWTs remain valid for up to 15 minutes, which the spec states.

### D7. Client failure handling

- Add `status` to `ApiError`.
- `refreshAccessToken`: only a 401 clears the token and calls the session-expired handler. Other failures return `false` with no sign-out.
- `auth.client.refreshSession` returns the session, or `null` on a 401. Anything else throws, including the `TypeError` from a network failure. `ApiError` stays inside `services/`.
- `AuthProvider`: on a throw, set `isSessionUnavailable` and retry every 5 s, clearing the timer on unmount. `isInitializing` ends after the first attempt.
- `ProtectedRoute`: renders a connection message while unavailable, never a redirect.
- `LoginPage`: renders nothing while initializing, `Navigate`s to `redirect` when `user` is set, otherwise shows the form. This keeps login reachable when the API is down.

**Rejected:** proactive refresh on `visibilitychange` and an `online` listener. The 401 path already refreshes lazily, and the 5 s retry reaches a returning network quickly.

### D8. Presence cookie and environment names

Add `flowledger_session=1; HttpOnly; SameSite=Lax; Path=/; Domain; Secure (prod)`, with the same lifetime as the refresh cookie and cleared with it. `Lax` lets a link from another site reach the app. It carries no token, and the gateway only checks for its presence. One helper returns the `Set-Cookie` array, and one returns the clearing array. Call sites: `register`, `login`, `refresh`, `logout`, and the Google callback, which also appends its state cookie.

Non-production uses `flowledger_dev_refresh_token` and `flowledger_dev_session`, chosen by `NODE_ENV`, so no env var or `.env` edit is needed. The repo `.env` that holds the dev URLs sets `development` and production's sets `production`; task 7.4 confirms this on the running dev API. Production's refresh cookie name is unchanged.

The gateway's `REFRESH_TOKEN_COOKIE_NAME` changes to `flowledger_session` in `flowledger_landing`, after the API deploys. Until then `LoginPage`'s redirect limits V1 to one extra click.

**Rejected:** a host-only dev cookie keeps sending the production cookie to the dev API under the same name. A client-set `document.cookie` is subject to Safari's 7-day script-cookie cap.

### D9. Google and registration

`GET /auth/google` takes an optional `keepLoggedIn`, validated as `"true"` or `"false"` because query values are strings (`z.coerce.boolean` would read `"false"` as true), and carried in the signed state. Omitted means `true` everywhere, matching the approved checked default and today's behavior: the state check uses `payload.keepLoggedIn !== false`, so a state issued before deploy still works. `GoogleOAuthButton` takes an optional `keepLoggedIn` prop defaulting to `true`, and Login passes its checkbox state. `loginSchema` gains `keepLoggedIn` defaulting to `true`.

### D10. Icons: static files at conventional paths

**Root cause, verified on both live hosts:** `index.html` declared only `favicon.svg`. `/apple-touch-icon.png` and `/manifest.webmanifest` returned `200 text/html` from the app-shell fallback, and `/favicon.ico` returned 404. The hostname is not a factor. The Cloudflare `max-age=14400` affects only rollout.

Use the conventional minimal set: `favicon.ico` (32), `favicon.svg`, `apple-touch-icon.png` (180), and a manifest with 192, 512, and maskable 512 PNGs. Files sit at root paths, so the landing page, served at `/` with only an SVG declaration, also benefits from the browsers' root-path lookups without a change to that repo.

All icons come from the `BrandLogo` mark, and `favicon.svg` is replaced with it, because it had drifted slightly in proportion. The Apple icon is opaque and full-bleed, because iOS applies its own mask and renders transparency as black. The maskable icon is padded to a 64-unit canvas, because the ledger's corners would otherwise fall outside the 40% safe radius.

**Follow-up on a physical iPhone.** The shortcut kept showing a white "F" on `theme_color` green, in Safari and Chrome. Cloudflare event logs from those attempts establish:

- Confirmed: Vite's SPA fallback answered missing icon paths with `200 text/html`. Safari probed `/apple-touch-icon-240x240.png` and its `-precomposed` variant at 04:35:23 and got HTML.
- Confirmed: iOS's fetcher received a valid PNG from `/apple-touch-icon.png` on each attempt, so CDN caching and blocked requests are not the cause. It refetched on every attempt, so it wasn't skipping the fetch because of a device cache.
- Ruled out: serving a PNG at `/apple-touch-icon-precomposed.png`. The fetcher got HTML there at 04:14 and a PNG from 04:29, and the owner still reported the "F". That duplicate was removed.
- Confirmed: iOS never requested the manifest icons.
- Hypothesis: iOS uses the `240x240` response, or wants that size, so the HTML or the missing size produces the fallback. Its selection logic isn't observable. A device test decides.

So: add a real 240x240 icon and declare it, and return 404 for other missing root-level `.png` and `.ico` requests through a small Vite plugin used by both the dev and preview servers. Production's landing page is separate and declares only the SVG.

PNGs are rendered once with the installed Playwright Chromium and committed, with no build step or dependency.

`display: standalone` enables installation. `start_url: /login` avoids the landing page, because `LoginPage` already sends signed-in users into the app.

**Rejected:** `vite-plugin-pwa` and a service worker add infrastructure with no need. A build-time icon pipeline is unnecessary for assets that rarely change. `display: browser` keeps today's shortcut behavior but blocks PWA installation.

## Risks / Trade-offs

- [Checked by default keeps 30-day sessions on shared computers unless the user unticks it] → Owner decision that preserves today's behavior. Logout still ends the session.
- [Mobile root cause remains partly unknown] → The device matrix in tasks §8 measures it. ST-002's "done" requires it to pass.
- [Pine series on charcoal is about 2.4:1 for non-text, slightly below today's 2.8:1] → Accepted to preserve brand colors and out of the roadmap's criteria, checked visually.
- [A stale presence cookie after a refresh 401 sends the user through the app to `/login` instead of the landing page] → Harmless and expires with the session. Clearing cookies on a refresh 401 is rejected, because a late 401 could wipe a live cookie from a parallel refresh.
- [A failed logout request leaves the session alive, which is pre-existing] → Signing out only the UI wouldn't revoke the server token, and a reload would restore it. Logged as #031.
- [A refresh validated just before a password change can insert a successor that survives revocation] → Narrow race, accepted.
- [`display: standalone` gives an iOS home-screen app its own cookie store, so it needs its own login, and the Google redirect leaves the app's scope] → Requires device testing in tasks §8. Changing one manifest field reverts to a browser shortcut.
- [iOS and Cloudflare cache icons: the HTML fallback at `/apple-touch-icon.png` may be served for up to 4 hours after deploy, and existing shortcuts keep their icon] → Wait or purge, then remove and re-add the shortcut.
- [A shortcut added from the landing page at `/` gets no manifest behavior, because that page doesn't link it] → Add from inside the app or `/login`.
- [Rows grow, as they do today] → Logged as a known issue, not addressed.
- [Browsers holding a dev-written cookie under the production name fail once on production] → One login heals it.
- [Theme flash before React mounts, pre-existing] → Logged as a known issue.

## Migration Plan

1. Additive migration runs in the existing `prisma migrate deploy` step. Old code ignores the new columns, so rollback needs no schema change.
2. Tokens rotated under new code that survive a rollback are simply valid tokens, and old code revokes them on use.
3. After the API deploys, change the gateway constant in `flowledger_landing` and deploy it.

Merging to `razs_ai` releases nothing. A production release stays an explicit owner decision.

## Open Questions

- Which verified defect caused the original mobile logouts was never attributed. The owner's manual testing after the fixes found no remaining problem, so this stays unknown without affecting the design.
- Which of the icon changes resolved the iPhone fallback was not isolated. The owner reported icons working after the 240x240 icon and the 404 change shipped together.

## Production diagnostic (read-only, needs owner approval)

Counts tokens issued by a rotation, never used, and followed by a newer token for that user. A lost response produces this pattern, but so do V5, V6, and a device simply abandoned while another stays active, so a high count alone proves nothing. It returns aggregates only. On `flowledger_staging` it returned 62 tokens for 1 user, which is weak evidence for the reasons above.

```sql
SELECT count(*) AS orphaned_tokens, count(DISTINCT s."userId") AS users
FROM "RefreshToken" s
JOIN "RefreshToken" p ON p."userId" = s."userId"
  AND p."revokedAt" BETWEEN s."createdAt" - interval '2 seconds' AND s."createdAt" + interval '2 seconds'
WHERE s."revokedAt" IS NULL AND s."expiresAt" > now()
  AND EXISTS (SELECT 1 FROM "RefreshToken" n WHERE n."userId" = s."userId" AND n."createdAt" > s."createdAt");
```
