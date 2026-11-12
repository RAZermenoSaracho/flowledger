# Tasks

- [x] 1.1 Integration test: a CIMD client listing the Muse callback gets a code at exactly that URI. Near-miss redirects are rejected without redirecting. No `registration_endpoint`, and `POST /register` is 404.
- [x] 1.2 `docs/AUTH_FLOW.md`: Muse requirements and the remaining manual steps.
- [x] 1.3 `openspec validate b004-muse-oauth-callback --strict`.
- [x] 2.1 Serve `GET /oauth/clients/meta-muse.json` (public, JSON) from the OAuth server router: `client_id` = `${PUBLIC_API_URL}/oauth/clients/meta-muse.json`, `client_name` "Meta AI Muse", redirect `https://agent.meta.ai/api/hatch/oauth/callback`, `token_endpoint_auth_method` "none", `grant_types` ["authorization_code","refresh_token"], `response_types` ["code"]. Verify: a unit or route test showing it parses with `cimdDocumentSchema` and `client_id` equals the URL.
- [x] 2.2 Integration test with the Muse document as `client_id`:
  - near-miss and foreign redirects are rejected without redirect;
  - full authorize, consent, code, token, `/mcp`, refresh rotation and revoke;
  - write only when approved.
  - Existing CIMD and loopback tests are unchanged.
  - An API key bearer works on `/mcp` (existing coverage, referenced).
- [x] 2.3 Docs: the exact values to enter in Muse in `docs/AUTH_FLOW.md`, and a Grok API example with env vars in `docs/PUBLIC_API.md`.
- [x] 2.4 Staging: with the staging document URL as `client_id`, the real CIMD fetch, consent by the staging owner, the code redirect to Meta (not followed), token exchange, `/mcp` call, refresh and grant revoke. Discovery unchanged.
