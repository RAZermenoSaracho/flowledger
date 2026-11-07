## Purpose

OAuth 2.1 authorization server that lets MCP clients (ChatGPT, Claude Code) obtain user-approved, revocable, expiring access to the FlowLedger `/mcp` endpoint without static API keys.

## ADDED Requirements

### Requirement: Discovery metadata
The API host SHALL publish OAuth authorization-server metadata and protected-resource metadata. Protected-resource metadata SHALL be served at both `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-protected-resource` with `resource = ${PUBLIC_API_URL}/mcp` and the API host as authorization server. Authorization-server metadata SHALL advertise `code_challenge_methods_supported ["S256"]`, `grant_types_supported ["authorization_code","refresh_token"]`, `token_endpoint_auth_methods_supported ["none"]`, `client_id_metadata_document_supported true`, `authorization_response_iss_parameter_supported true`, `scopes_supported ["read","write","offline_access"]`, and SHALL NOT include a `registration_endpoint`. A `401` from `/mcp` SHALL carry `WWW-Authenticate: Bearer resource_metadata="<protected-resource metadata URL>"`.

#### Scenario: Client discovers the server
- **WHEN** a client requests `GET /.well-known/oauth-protected-resource/mcp` and then the advertised authorization-server metadata
- **THEN** the responses contain the values above and no `registration_endpoint`

#### Scenario: Unauthenticated MCP call
- **WHEN** a client calls `/mcp` with no or an invalid bearer token
- **THEN** the response is 401 with a `WWW-Authenticate` header containing `resource_metadata`

### Requirement: Client identification by metadata document
The server SHALL identify OAuth clients only by Client ID Metadata Documents: the `client_id` MUST be an `https://` URL with a path, default port, no credentials and no fragment. The server SHALL NOT support dynamic client registration or client secrets.

#### Scenario: Unsupported client_id
- **WHEN** `/authorize` is called with a `client_id` that is not an https URL, has userinfo, a non-default port or no path
- **THEN** the request is rejected with an error page or JSON error and the user agent is not redirected

#### Scenario: Registration attempted
- **WHEN** a client calls `POST /register`
- **THEN** the response is 404

### Requirement: SSRF-safe metadata document fetch
Fetching a client metadata document SHALL resolve the hostname once, reject the fetch if ANY resolved address is private, loopback, link-local, unique-local, CGNAT, multicast, reserved, documentation or cloud-metadata (IPv4, IPv6 and IPv4-mapped/NAT64/6to4 IPv6 forms, and IP-literal hosts), and SHALL connect only to an address from that validated resolution (a DNS answer that changes after validation MUST NOT be used). The fetch SHALL use https only, follow no redirects, time out after 5 s in total, read at most 64 KB, require a 200 response with a JSON content type, and send no cookies or credentials. A document SHALL be accepted only if its `client_id` equals the requested URL exactly, `redirect_uris` is a non-empty array of valid URIs, and any declared `token_endpoint_auth_method` is `none` or the document's `token_endpoint_auth_methods_supported` includes `none` (the client is then treated as public).

#### Scenario: Hostname resolves to a private address
- **WHEN** the client_id host resolves to `10.0.0.5`, `127.0.0.1`, `169.254.169.254`, `100.64.0.1`, `::1`, `fd00::1` or `::ffff:127.0.0.1`
- **THEN** no connection is made and the client is rejected as invalid

#### Scenario: Mixed public and private answers
- **WHEN** the host resolves to one public and one private address
- **THEN** the client is rejected

#### Scenario: DNS rebinding
- **WHEN** the first resolution returns a public address and a later resolution would return a private one
- **THEN** the connection goes to the validated public address and no second resolution is trusted

#### Scenario: Redirect, oversize, wrong type, wrong id
- **WHEN** the document URL answers 301, or streams more than 64 KB, or is not JSON, or its `client_id` differs from the URL, or lacks `redirect_uris`
- **THEN** the client is rejected as invalid

### Requirement: Authorization request validation
`/authorize` SHALL require `response_type=code`, a `redirect_uri` that exactly matches one of the document's `redirect_uris` (an http loopback entry on `localhost`, `127.0.0.1` or `[::1]` matches any port with the same scheme, host and path), a PKCE `code_challenge` with method `S256` (`plain` is rejected), and `resource` equal to `${PUBLIC_API_URL}/mcp`. An invalid client or redirect SHALL produce an error page and never a redirect to the supplied redirect URI. Other errors SHALL redirect to the validated redirect URI with `error` and the client's `state`.

#### Scenario: Redirect URI not registered
- **WHEN** `redirect_uri` is not in the client's document
- **THEN** the user sees an error and is not redirected

#### Scenario: Missing or wrong resource
- **WHEN** `resource` is absent or differs from `${PUBLIC_API_URL}/mcp`
- **THEN** the client is redirected with `error=invalid_target`

#### Scenario: Plain PKCE
- **WHEN** `code_challenge_method=plain` or no challenge is sent
- **THEN** the request is rejected with `invalid_request`

#### Scenario: Loopback port
- **WHEN** the document lists `http://localhost/callback` and the request uses `http://localhost:53124/callback`
- **THEN** the redirect is accepted and the code is later delivered to exactly the requested URI

### Requirement: Login and consent handoff
After a valid authorization request the server SHALL redirect the browser to `${WEB_APP_URL}/oauth/authorize?req=<signed consent request>`. The consent request SHALL be a JWT signed with the server secret, audience `oauth-consent`, expiring in 10 minutes, carrying the client id, redirect URI, code challenge, state, requested scopes and resource. The SPA SHALL send an unauthenticated visitor to `/login?redirect=<consent URL>` and return to the consent URL after login (email, Google). Redirect parameters MUST be same-origin relative paths; other values are ignored.

#### Scenario: Logged-out visitor
- **WHEN** an unauthenticated user opens the consent URL
- **THEN** they are sent to login, and after a successful login they land on the same consent URL

#### Scenario: Open redirect attempt
- **WHEN** the login page is opened with `redirect=https://evil.example` or `redirect=//evil.example`
- **THEN** after login the user lands on the dashboard

### Requirement: Consent context and decision
`GET /oauth/authorize/context?req=` SHALL accept only a web-session JWT and return the client name, client id, redirect host, whether write was requested, and the signed-in user's email. `POST /oauth/authorize/decision` SHALL accept only a web-session JWT and `{ req, approve, allowWrite, lifetime }` (lifetime one of `1d`, `1m`, `1y`, `never`), verify `req` (signature, audience, expiry), and bind the grant to the authenticated user. Client-controlled parameters SHALL come only from the signed `req`, never from the decision body. On approval the server SHALL re-validate the client document and redirect URI, create an `OAuthGrant`, and return a redirect URL `redirect_uri?code=&state=&iss=`; on denial it SHALL return `redirect_uri?error=access_denied&state=&iss=`. Scope `read` is always granted; `write` is granted only if the client requested it and `allowWrite` is true. `offline_access` is accepted and ignored.

#### Scenario: Approve read-only
- **WHEN** the user approves a client that requested only `read`
- **THEN** a grant with scopes `["read"]` and the chosen lifetime is created and the redirect URL carries `code`, `state` and `iss`

#### Scenario: Write opt-in
- **WHEN** the client requested `write` and the user approves with `allowWrite` false
- **THEN** the grant has scopes `["read"]`

#### Scenario: Write not requested
- **WHEN** the client did not request `write` and the body sends `allowWrite` true
- **THEN** the grant has scopes `["read"]`

#### Scenario: Deny
- **WHEN** the user denies
- **THEN** no grant is created and the redirect URL has `error=access_denied`, `state` and `iss`

#### Scenario: Tampered or expired request
- **WHEN** `req` has a bad signature, wrong audience or is older than 10 minutes
- **THEN** the endpoint answers 400 and creates nothing

#### Scenario: Non-session credential
- **WHEN** the endpoints are called with an API key or an OAuth access token
- **THEN** the response is 401

### Requirement: Consent page
The SPA SHALL provide `/oauth/authorize` outside the application layout showing the app name, redirect host, "Signed in as <email>" with a "Not you?" action that signs out and returns to the same consent URL, a permission list (read always; an unticked "Also create and update transactions" checkbox only when write was requested), a lifetime radio group (1 day, 1 month default, 1 year, Never with a visible warning), and Allow and Deny buttons. The page SHALL refuse to render its actions when displayed inside a frame. The page SHALL be served with `frame-ancestors 'none'` and `X-Frame-Options: DENY`.

#### Scenario: Default state
- **WHEN** the page loads for a client that requested write
- **THEN** the write checkbox is unticked and the lifetime is 1 month

#### Scenario: Framed
- **WHEN** the page is loaded inside an iframe
- **THEN** no Allow or Deny control is shown

#### Scenario: Context load fails
- **WHEN** the request is expired or invalid
- **THEN** the page shows an error and no Allow button

### Requirement: Authorization code
A code SHALL be single-use, valid for 60 seconds, stored only as a hash on the grant, and bound to the client, redirect URI, PKCE challenge and resource. PKCE SHALL be verified with S256 at the token endpoint. Presenting a code that was already used SHALL revoke the grant and return `invalid_grant`.

#### Scenario: Successful exchange
- **WHEN** the client exchanges a fresh code with the correct verifier, redirect URI, client id and resource
- **THEN** it receives a `flo_` access token, a `flr_` refresh token, `token_type Bearer`, `expires_in` and `scope`

#### Scenario: Wrong verifier, redirect, client or resource
- **WHEN** any of these differ from the authorization request
- **THEN** the response is `invalid_grant` (or `invalid_target` for resource) and no token is issued

#### Scenario: Expired code
- **WHEN** the code is exchanged after 60 seconds
- **THEN** the response is `invalid_grant`

#### Scenario: Replayed code
- **WHEN** a code that was already exchanged is presented again
- **THEN** the response is `invalid_grant` and the grant is revoked, so its tokens stop working

#### Scenario: Concurrent code exchange
- **WHEN** two requests present the same fresh code at once
- **THEN** exactly one succeeds and the other fails as a replay

### Requirement: Token lifetimes
Access tokens SHALL expire at the earlier of one hour after issue and the grant's expiry. Refresh tokens SHALL be valid until the grant's expiry (or without limit for a Never grant). Refreshing SHALL never extend the grant. Plaintext tokens SHALL be returned once and stored only as SHA-256 hashes.

#### Scenario: Refresh near grant end
- **WHEN** a refresh happens 10 minutes before the grant expires
- **THEN** the new access token expires at the grant expiry, not 1 hour later

#### Scenario: Expired grant
- **WHEN** a refresh or `/mcp` call happens after the grant expired
- **THEN** refresh returns `invalid_grant` and `/mcp` returns 401

#### Scenario: Never grant
- **WHEN** a Never grant is refreshed repeatedly
- **THEN** each refresh issues a new 1 hour access token and the grant stays valid

### Requirement: Refresh rotation, retry grace and reuse detection
Each refresh token SHALL be accepted once. A successful refresh SHALL atomically replace the grant's token pair; losing an atomic rotation race SHALL NOT issue a second pair for the same presentation. Presenting the immediately previous refresh token within 30 seconds of its rotation SHALL be treated as a legitimate retry or concurrent refresh: the server SHALL issue a fresh pair, which invalidates the pair issued by the other request, and SHALL NOT revoke the grant. Presenting a previous refresh token more than 30 seconds after its rotation SHALL revoke the grant and return `invalid_grant`. A refresh token that matches no grant SHALL return `invalid_grant`. A refresh request SHALL fail if the client id differs from the grant's, and a requested scope MUST be a subset of the grant's scopes.

#### Scenario: Normal rotation
- **WHEN** the client refreshes with its current refresh token
- **THEN** it receives a new pair and the old access token stops working

#### Scenario: Two simultaneous refreshes
- **WHEN** two requests present the same current refresh token at once
- **THEN** both receive `200` (one through the grace rule), the grant is not revoked, and only the last-issued pair is valid

#### Scenario: Lost response retry
- **WHEN** the client re-presents the old refresh token 5 seconds after a rotation
- **THEN** it receives a fresh pair and the grant remains active

#### Scenario: Late reuse
- **WHEN** an old refresh token is presented 2 minutes after it was rotated
- **THEN** the response is `invalid_grant` and the grant is revoked

#### Scenario: Scope widening
- **WHEN** a refresh requests `write` on a read-only grant
- **THEN** the response is `invalid_scope`

### Requirement: Revocation
Revoking a grant SHALL be immediate: a revoked grant SHALL NOT authenticate any new request, refresh, or code exchange. Revocation SHALL be checked against the database on every `/mcp` request; a request already past authentication MAY complete. A grant SHALL be revocable by the owning user, by the client via `/revoke` (RFC 7009, any token of that grant, unknown tokens answer 200), and by deletion of the user.

#### Scenario: Revoke from the UI
- **WHEN** the user revokes a connected app and the client then calls `/mcp`
- **THEN** the call returns 401

#### Scenario: Client revoke
- **WHEN** a client posts its refresh token to `/revoke`
- **THEN** the grant is revoked and the response is 200

#### Scenario: Another client's token
- **WHEN** a client posts a token that belongs to a grant of a different client
- **THEN** nothing is revoked and the response is 200

#### Scenario: User deleted
- **WHEN** the user account is deleted
- **THEN** the grants are deleted and `/mcp` returns 401

### Requirement: OAuth credentials on the credential verifier
The credential verifier SHALL accept `flo_` access tokens in addition to API keys: the token is found by hash, `accessExpiresAt` is in the future, the grant is not revoked or expired, and the user exists. The result carries `kind "oauth"`, the grant id as credential id, and the grant scopes. A web JWT, a refresh token (`flr_`) or an unknown prefix SHALL be rejected. `lastUsedAt` SHALL be updated at most once every 5 minutes without delaying the request. `/v1` is unaffected (API keys only).

#### Scenario: Valid OAuth token on MCP
- **WHEN** a client calls `/mcp` with a valid `flo_` token on a read-only grant
- **THEN** read tools are available and write tools are not

#### Scenario: Refresh token used as bearer
- **WHEN** a `flr_` token is sent as the bearer
- **THEN** the response is 401

#### Scenario: OAuth token on /v1
- **WHEN** a `flo_` token is sent to a `/v1` route
- **THEN** the response is 401

### Requirement: Connected apps management
`GET /users/me/oauth-grants` SHALL list the signed-in user's completed, non-revoked, non-expired grants with id, client name, client id, redirect host, scopes, created, expires and last used; it SHALL never expose hashes or tokens. `DELETE /users/me/oauth-grants/:id` SHALL revoke the user's own grant and answer 404 for another user's or unknown id. Both SHALL accept only a web-session JWT. The Developer page SHALL show a Connected apps section listing these with a Revoke action confirmed by name and an empty state.

#### Scenario: Isolation
- **WHEN** user B revokes the id of user A's grant
- **THEN** the response is 404 and A's grant stays active

#### Scenario: Revoke confirmation
- **WHEN** the user clicks Revoke on an app
- **THEN** a dialog naming the app asks for confirmation before the grant is revoked

#### Scenario: Listing
- **WHEN** the user has an approved grant and an unfinished one (code never exchanged)
- **THEN** only the approved grant is listed

### Requirement: Client compatibility
The flow SHALL work end to end against `api-flowledger-dev.razs.dev` for ChatGPT (client document `https://chatgpt.com/oauth/client.json`, redirect `https://chatgpt.com/connector_platform_oauth_redirect`, public client, `iss` on the redirect, S256) and for Claude Code (document auto-discovered, loopback redirect with a random port, `offline_access` advertised).

#### Scenario: Claude Code
- **WHEN** the user runs `/mcp` in Claude Code against the dev MCP URL and approves
- **THEN** the connection succeeds and a tool call returns data

#### Scenario: ChatGPT
- **WHEN** the user adds the dev MCP URL as a ChatGPT connector and approves
- **THEN** the connector shows as connected and a tool call returns data
