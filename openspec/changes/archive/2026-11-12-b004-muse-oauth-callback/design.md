# Design

## Decisions

- **Host Muse's Client ID Metadata Document on the API host.** Muse asks for a Client ID, and FlowLedger identifies clients by CIMD URL. Serving `/oauth/clients/meta-muse.json` gives Muse a stable Client ID (that URL) and reuses the whole existing client pipeline untouched. Hosting the document makes FlowLedger vouch for Muse's callback, the same trust as a pre-registered client, but expressed through the standard mechanism. The document is built from `PUBLIC_API_URL`, so each environment's Client ID points at itself.
  - The server fetches its own public hostname, which passes the SSRF guard because it resolves to the public Cloudflare edge.
  - If the API host is unreachable, MCP is unreachable anyway.
- **Public client plus PKCE.** Muse's docs don't state whether a secret is required. FlowLedger supports no client secrets by design. If Muse requires one, adding confidential-client support is a separate decision.
- **Grok uses personal API keys.** The xAI API sends a caller-supplied token in `Authorization`. A user-created read-only key already has per-user authorization, scope, expiry, revocation and audit. OAuth access tokens expire after 1 hour and the xAI API cannot refresh them.

## Rejected

- **A server-side pre-registered client list.** It adds a lookup layer and needs the consent schema's `cid` relaxed from URL to string, for the same outcome.
- **Dynamic client registration.** It reverses the CIMD-only decision, and an advertised `registration_endpoint` may change how ChatGPT and Claude register.
- **A separate Muse or Grok auth handler, a token proxy, or a service token.**

## External steps (owner)

- **Muse:** submit a connector on platform.muse.ai with the values in `docs/AUTH_FLOW.md`, then pass Meta's review. Approval is at Meta's discretion.
- **Grok:** create a read-only API key in FlowLedger › Profile › Developer and pass it as the xAI `authorization`.
