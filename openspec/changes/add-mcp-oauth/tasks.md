## 1. Spike (first, throwaway branch of work; record findings in design.md Open Questions)

- [x] 1.1 Prerequisite check: `add-personal-api-keys` and `add-mcp-server` are implemented (credential.ts, `/mcp`, SDK installed, `PUBLIC_API_URL`, `trust proxy`)
- [x] 1.2 Spike: mount `mcpAuthRouter` at the app root in Express 4 with an in-memory provider and a `clientsStore` exposing only `getClient` (CIMD stub); confirm the endpoint paths, no `/register`, custom metadata override order, S256 enforcement, and that a nested-Express-5 router behaves under the real `app.ts` middleware
- [x] 1.3 Spike: capture the real Claude Code and ChatGPT client metadata documents and their `/authorize` and `/token` parameters (resource on token calls, loopback redirect shape) and record them
- [x] 1.4 Spike: prove an `https.Agent` custom `lookup` pins the dialled address (fake DNS returning different answers per call) on the repo's Node version

## 2. Data model and shared contracts

- [x] 2.1 Add `OAuthGrant` (+ `rotatedAt DateTime?`, `User.oauthGrants` back-relation, `@@index([userId])`) to `database/prisma/schema.prisma`; update `docs/DATA_MODEL.md`
- [x] 2.2 Create the Prisma migration (`prisma migrate dev`, no raw SQL) and run `prisma:generate`
- [x] 2.3 Add shared Zod schemas in `packages/shared/src/schemas/` (`oauthConsentRequest` payload, `oauthContextQuery`, `oauthDecision` using `credentialLifetimeSchema`, `oauthGrantSummary`, CIMD document schema) with tests in `schemas/tests/`
- [ ] 2.4 Add `safeRedirect()` helper (web utils) with table tests including `//x`, `https://x`, `/\x`, encoded variants

## 3. CIMD client store

- [x] 3.1 `oauth/providers/cimd/utils/ipGuard.ts`: `isPublicAddress` per D8 (IPv4, IPv6, mapped, NAT64, 6to4, literals); tests for every range and edge
- [x] 3.2 `oauth/providers/cimd/services/read.service.ts`: URL checks, single resolution + set validation, pinned `https.Agent` lookup, 5 s deadline, 64 KB stream cap, no redirects, content-type check, Zod parse, `client_id` equality; generic outward errors, host-only logs
- [x] 3.3 5-minute / 100-entry success-only cache around the fetch
- [x] 3.4 `clientsStore` (`getClient` only) plus, only if task 1.3 shows it is needed, the `AsyncLocalStorage` loopback-port middleware for `/authorize` and `/token`
- [x] 3.5 Tests with mocked `dns.lookup`: private/mixed/mapped answers rejected, rebinding (second lookup ignored, dialled IP asserted via local TLS server), 301, oversize, wrong type, id mismatch, missing/invalid `redirect_uris`, bad `token_endpoint_auth_method`, cache hit/expiry/no-failure-caching

## 4. Provider and OAuth routes

- [x] 4.1 `oauth/utils/consentRequest.ts`: sign/verify (aud `oauth-consent`, 10 min) + tests
- [x] 4.2 `oauth/utils/tokens.ts`: generate `flo_`/`flr_`/code values, reuse the sha256 helper from the API-keys change + tests
- [x] 4.3 `oauth/services/`: `authorize` (resource check, redirect to SPA), `challengeForAuthorizationCode`, `exchangeAuthorizationCode` (atomic claim, replay revoke), `exchangeRefreshToken` (D6 algorithm, scope subset, expiry cap), `revokeToken`; Prisma-backed `OAuthServerProvider` assembling them; unit tests with `mockDeep` incl. `count === 0` branches, grace/late reuse with fake timers
- [x] 4.4 Metadata: custom `/.well-known/oauth-authorization-server` and both protected-resource paths; mount `mcpAuthRouter` in `app.ts`; pass `resourceMetadataUrl` (`${PUBLIC_API_URL}/.well-known/oauth-protected-resource/mcp`) to `requireBearerAuth` in `mcp/mcp.routes.ts`; test that a `/mcp` 401 carries `WWW-Authenticate: Bearer resource_metadata="..."`
- [x] 4.5 Consent services/controllers/routes: `GET /oauth/authorize/context`, `POST /oauth/authorize/decision` (`requireAuth`, `validate(shared schema)`, `asyncHandler`, `serialize`), tests (tamper, expiry, write rules, deny, iss, redirect re-validation, wrong credential type)
- [x] 4.6 `GET /users/me/oauth-grants`, `DELETE /users/me/oauth-grants/:id` (ownership in `where`, `notFound()`), list filter for completed/active grants, tests incl. user isolation
- [x] 4.7 `verifyCredential` `flo_` branch (+ `kinds` option so `/v1` stays API-key only), throttled `lastUsedAt`, tests; confirm `/mcp` works with an OAuth token without adapter changes
- [x] 4.8 Integration tests (supertest + testcontainers): full PKCE flow with a stub CIMD seam, deny, replay, wrong verifier/redirect/resource, expiry cap, Never rotation, refresh reuse (grace vs late), revoke via UI and via `/revoke`, user deletion -> 401

## 5. Web

- [x] 5.1 `ProtectedRoute` and `LoginPage` `?redirect=` preservation via `safeRedirect()`; pass through `GoogleOAuthButton`; reuse in `OAuthCallbackPage`; RTL tests including open-redirect inputs
- [x] 5.2 `oauthAuthorize.client.ts`, hooks, and `OAuthAuthorizePage` per spec (outside `AppLayout`, framed fallback, Not you?, lifetime radios, unticked write checkbox, Never warning, a11y per UI/UX rules); route in `main.tsx` + `routes.ts`; RTL + msw tests
- [x] 5.3 Frame headers in `apps/web/vite.config.ts` (`preview.headers`, `server.headers`)
- [x] 5.4 Connected apps section on the Developer page (`oauthGrants.client.ts`, hooks, list, empty state, revoke dialog naming the app, aria-live result); RTL + msw tests

## 6. Docs and verification

- [ ] 6.1 (API docs + KNOWN_ISSUES done; Developer page text is web) Document the OAuth flow in `docs/AUTH_FLOW.md` and the Developer page "Connect an AI client" text (ChatGPT connector steps); log deferred items (DCR, `iss` on SDK error redirects) in `docs/KNOWN_ISSUES.md`
- [ ] 6.2 `npm run typecheck`, `npm run lint`, `npm run test`; integration suite with the Docker VM
- [ ] 6.3 After deploy to dev: `curl -I` frame headers on `flowledger-dev.razs.dev` and `/oauth/authorize`; metadata reachable on `api-flowledger-dev.razs.dev`
- [ ] 6.4 Manual acceptance (dev web host :5174 running): Claude Code `/mcp` login -> tool call; ChatGPT connector -> tool call; revoke in Connected apps -> next call 401; deny -> `access_denied` with `iss`
