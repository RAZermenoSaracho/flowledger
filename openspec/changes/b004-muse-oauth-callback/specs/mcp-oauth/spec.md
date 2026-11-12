## MODIFIED Requirements

### Requirement: Client compatibility
The flow SHALL work end to end against `api-flowledger-dev.razs.dev` for ChatGPT (client document `https://chatgpt.com/oauth/client.json`, redirect `https://chatgpt.com/connector_platform_oauth_redirect`, public client, `iss` on the redirect, S256) and for Claude Code (document auto-discovered, loopback redirect with a random port, `offline_access` advertised). Meta AI Muse SHALL connect as a public client identified by a Client ID Metadata Document that FlowLedger serves at `${PUBLIC_API_URL}/oauth/clients/meta-muse.json`, whose only redirect is `https://agent.meta.ai/api/hatch/oauth/callback`; that URL is the Client ID entered in Muse. The Grok API (xAI Responses, SDK and Speech-to-Speech remote MCP tools) SHALL connect with a user's personal API key sent as the tool's `authorization` bearer. No Muse- or Grok-specific authentication path SHALL exist.

#### Scenario: Claude Code
- **WHEN** the user runs `/mcp` in Claude Code against the dev MCP URL and approves
- **THEN** the connection succeeds and a tool call returns data

#### Scenario: ChatGPT
- **WHEN** the user adds the dev MCP URL as a ChatGPT connector and approves
- **THEN** the connector shows as connected and a tool call returns data

#### Scenario: Muse flow on FlowLedger's side
- **WHEN** the Muse document URL authorizes as `client_id` with its callback, S256 and the MCP `resource`, and the user approves
- **THEN** the code, `state` and `iss` reach exactly the callback, the token exchange returns a working `/mcp` token, refresh rotates it, and revocation disables it

#### Scenario: Muse redirect is exact
- **WHEN** the Muse document URL authorizes with any redirect other than exactly its callback, including another client's registered redirect
- **THEN** the request is rejected and the user agent is not redirected

#### Scenario: Muse client document
- **WHEN** anyone requests `GET /oauth/clients/meta-muse.json`
- **THEN** the response is a public JSON client document whose `client_id` equals the request URL, with exactly the Muse callback and `token_endpoint_auth_method` `none`

#### Scenario: Muse end to end
- **WHEN** an approved Muse connector configured with the Muse document URL as Client ID connects and the user approves on the FlowLedger consent page
- **THEN** Muse is connected and a tool call returns data (manual check, after Meta approves the connector)

#### Scenario: Grok API with a personal API key
- **WHEN** an xAI Responses API request includes an `mcp` tool with `server_url` set to the MCP URL and `authorization` set to `Bearer <read-only flk_ key>`
- **THEN** FlowLedger accepts the key on `/mcp`, read tools work, write tools are refused, and revoking the key stops access
