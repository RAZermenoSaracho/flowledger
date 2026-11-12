# Proposal

## Why

Meta AI Muse should be able to connect to the FlowLedger MCP endpoint (`https://api-flowledger.razs.dev/mcp`) through the existing OAuth server. Muse's OAuth callback is `https://agent.meta.ai/api/hatch/oauth/callback`.

FlowLedger has no redirect allowlist to add it to. Clients are identified only by Client ID Metadata Documents (CIMD). Every client document's `redirect_uris` act as its allowlist, any `https` redirect is valid in a document, and `/authorize` and consent both require an exact redirect match. If Muse presents a CIMD `client_id` listing that callback, it already works with no server change.

The only public evidence of how Muse registers (a vendor blog about a different MCP server) says it used Dynamic Client Registration. FlowLedger deliberately does not support DCR (`mcp-oauth`, "Client identification by metadata document"). Advertising a `registration_endpoint` could change how ChatGPT and Claude, which work today through CIMD, choose to register, and that cannot be verified offline.

## What Changes

- No change to OAuth server behavior, discovery metadata, scopes, PKCE or consent.
- Regression tests pin the Muse callback behavior:
  - a CIMD client listing the Muse callback is accepted;
  - the code is delivered only to that exact URI;
  - near-miss URIs (other path, query, host, `http`) are rejected without redirect;
  - discovery still has no `registration_endpoint` and `POST /register` stays 404.
- The `mcp-oauth` "Client compatibility" requirement names Muse as a CIMD client, with its end-to-end check left manual.
- `docs/AUTH_FLOW.md` documents what Muse must present, and the decision needed if Muse only supports DCR.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `mcp-oauth`: Client compatibility adds Meta AI Muse via CIMD.

## Impact

- Tests only in `apps/api` (`oauth.integration.test.ts`, CIMD read service test). `docs/AUTH_FLOW.md`.
- No production configuration, secret, scope or migration change.
