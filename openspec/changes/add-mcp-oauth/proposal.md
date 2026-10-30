## Why

ChatGPT can only connect to a remote MCP server through OAuth, and Claude Code is easier to connect with OAuth than with a pasted key. After `add-mcp-server` ships `/mcp` with API-key auth, FlowLedger needs an OAuth 2.1 authorization server so a user can run Connect -> Login -> Consent -> Pick lifetime -> Approve -> Connected from either client, and later see and revoke the connection.

## What Changes

- Add the `OAuthGrant` Prisma model (one row per approved connection: client, scopes, lifetime, authorization code, current token pair) and its migration.
- Mount the MCP SDK v1 `mcpAuthRouter` on the API host with a Prisma-backed `OAuthServerProvider` and a CIMD-only `clientsStore` (`getClient` only, no DCR). Serve custom authorization-server metadata and protected-resource metadata (both well-known paths); `/mcp` 401s gain `resource_metadata` by passing `resourceMetadataUrl` to the existing `requireBearerAuth` call in `mcp.routes.ts` (the only edit to the add-mcp-server files).
- `provider.authorize` requires `resource === ${PUBLIC_API_URL}/mcp` and redirects to the SPA with a signed 10-minute consent-request JWT.
- Add `GET /oauth/authorize/context` and `POST /oauth/authorize/decision` (web JWT via the existing `requireAuth`), which bind the decision to the signed-in user and return the client redirect URL (with `iss`).
- Single-use 60 s authorization codes stored on the grant; code replay revokes the grant. Access (`flo_`, at most 1 h, never past the grant) and rotating refresh (`flr_`) tokens with atomic rotation, a 30 s retry grace and reuse detection. `/revoke` revokes the grant.
- `GET /users/me/oauth-grants` and `DELETE /users/me/oauth-grants/:id`.
- Extend `verifyCredential` with the `flo_` branch so `/mcp` accepts OAuth access tokens with no change to the MCP adapter.
- SPA: `/oauth/authorize` consent page (outside AppLayout), `?redirect=` preservation in `ProtectedRoute` and `LoginPage`, and a Connected apps section on `/profile/developer`.
- SSRF-hardened CIMD fetch (DNS-rebinding-safe connection pinning).

## Capabilities

### New Capabilities
- `mcp-oauth`: OAuth 2.1 authorization server for the MCP endpoint (CIMD clients, PKCE S256, consent, grants, rotating tokens, revocation, connected-apps management, and the OAuth branch of credential verification).

### Modified Capabilities
<!-- None. The verifyCredential, Developer page and /mcp-auth extensions are written as mcp-oauth requirements because the other capabilities are not archived yet. -->

## Impact

- API: new `apps/api/src/modules/oauth/` (provider, CIMD client, consent controllers/services, grants controllers/services); `app.ts` mounts the auth router, well-known routes and `/users/me/oauth-grants`; `middleware/credential.ts` gains the `flo_` branch.
- Database: one migration adding `OAuthGrant` (plus a `User` back-relation).
- Shared: oauth decision/context/grant schemas in `packages/shared`.
- Web: new `pages/OAuthAuthorize/`, edits to `ProtectedRoute`, `LoginPage`, Developer page, and `vite.config.ts` (frame headers).
- Dependencies: none new (SDK, `express-rate-limit`, `jsonwebtoken` come from earlier changes or exist). Requires `add-personal-api-keys` (credential.ts, lifetime enum, `PUBLIC_API_URL`, `trust proxy`, Developer page, audit helper) and `add-mcp-server` (`/mcp`, SDK, Zod 3.25).
- Ops: dev web host `flowledger-dev.razs.dev` (:5174) must be running for end-to-end checks. No cloudflared/pm2/deploy changes.
- Non-goals: DCR, `OAuthClient`/`OAuthToken` tables, remembered consent, OIDC/id tokens, client secrets, per-scope refresh narrowing UI.
