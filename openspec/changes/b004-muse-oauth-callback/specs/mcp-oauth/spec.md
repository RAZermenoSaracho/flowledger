## MODIFIED Requirements

### Requirement: Client compatibility
The flow SHALL work end to end against `api-flowledger-dev.razs.dev` for ChatGPT (client document `https://chatgpt.com/oauth/client.json`, redirect `https://chatgpt.com/connector_platform_oauth_redirect`, public client, `iss` on the redirect, S256) and for Claude Code (document auto-discovered, loopback redirect with a random port, `offline_access` advertised). Meta AI Muse SHALL be supported as a public CIMD client whose document lists `https://agent.meta.ai/api/hatch/oauth/callback`. Authorization codes SHALL be delivered only to that exact URI, and supporting Muse SHALL NOT add dynamic client registration, a redirect allowlist that bypasses the client document, or broader scopes.

#### Scenario: Claude Code
- **WHEN** the user runs `/mcp` in Claude Code against the dev MCP URL and approves
- **THEN** the connection succeeds and a tool call returns data

#### Scenario: ChatGPT
- **WHEN** the user adds the dev MCP URL as a ChatGPT connector and approves
- **THEN** the connector shows as connected and a tool call returns data

#### Scenario: Muse callback accepted exactly
- **WHEN** a client whose metadata document lists `https://agent.meta.ai/api/hatch/oauth/callback` authorizes with that redirect, and the user approves
- **THEN** the code, `state` and `iss` are delivered to exactly that URI

#### Scenario: Muse callback near-miss rejected
- **WHEN** the same client authorizes with a redirect differing from the listed callback by path, query, scheme or host
- **THEN** the request is rejected and the user agent is not redirected

#### Scenario: Muse end to end
- **WHEN** the user adds the MCP URL in Muse and approves on the FlowLedger consent page
- **THEN** Muse is connected and a tool call returns data (manual check; requires Muse to present a CIMD `client_id`)
