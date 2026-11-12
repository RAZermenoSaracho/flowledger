# Proposal

## Why

The owner wants Meta AI Muse and Grok to use FlowLedger's MCP server (`https://api-flowledger.razs.dev/mcp`) through the same OAuth and credential infrastructure as ChatGPT and Claude.

- **Muse** connectors are added through Meta's Muse Connector Platform, which requires submission and approval (platform.muse.ai, Connector guidelines §5–6 and Terms §2.1). The connection form asks for an OAuth Client ID. The public docs say nothing about Dynamic Client Registration or Client ID Metadata Documents (CIMD). Muse's callback is `https://agent.meta.ai/api/hatch/oauth/callback`. FlowLedger only accepts CIMD clients, whose `client_id` is an https URL the client hosts, so there is no Client ID to give Muse.
- **Grok**: remote MCP is documented only for the xAI API, SDK and Speech-to-Speech API (docs.x.ai, Remote MCP Tools). The caller passes a token in the tool's `authorization` field, and no interactive OAuth flow is documented. Grok.com connectors (verified on staging) are a standard CIMD client, `https://grok.com/oauth/mcp-client.json`. `/mcp` already accepts personal API keys (`fl_`), which are user-created, read/write scoped, expiring and revocable, so Grok needs no server change.

## What Changes

- FlowLedger publishes a Client ID Metadata Document for Muse at `${PUBLIC_API_URL}/oauth/clients/meta-muse.json`, on the API host. It contains:
  - `client_id` equal to its own URL;
  - `client_name` "Meta AI Muse";
  - one exact redirect, `https://agent.meta.ai/api/hatch/oauth/callback`;
  - public client, `token_endpoint_auth_method: "none"`.
- That URL is the Client ID entered in Muse. The existing CIMD pipeline handles it unchanged: SSRF-safe fetch, exact redirect matching at `/authorize` and at consent, PKCE S256, `resource`, consent, scopes, tokens, refresh rotation and revocation.
- No auth code change, client list, dynamic registration, client secret, wildcard, migration or new token logic. Staging and production each serve their own document under their own API host.
- Regression tests:
  - the document parses as a valid CIMD whose `client_id` equals its URL;
  - the Muse client gets codes only at its exact callback;
  - near misses and other clients' redirects are rejected without redirecting;
  - full code, token, `/mcp`, refresh and revoke;
  - an API key works on `/mcp` as a bearer.
- `docs/AUTH_FLOW.md` and `docs/PUBLIC_API.md` give the exact values to enter in Muse and a Grok API example using environment variables.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `mcp-oauth`: "Client compatibility" adds Muse (FlowLedger-hosted client document) and the Grok API (personal API key).

## Impact

- `apps/api/src/modules/oauth` adds one public GET route serving a static JSON document, with tests.
- Docs only for Grok.
- Production gets the Muse client only when PR #40 is deployed. No production configuration or records are changed now.
