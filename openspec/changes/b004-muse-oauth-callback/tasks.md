# Tasks

- [x] 1.1 Integration test: a CIMD client listing the Muse callback gets a code at exactly that URI after approval. Near-miss redirects (path, query, `http`, other host) are rejected without redirect. Discovery has no `registration_endpoint`, and `POST /register` is 404.
- [x] 1.2 `docs/AUTH_FLOW.md`: Muse requirements (CIMD `client_id`, `resource` = MCP URL, S256, public client, scopes `read`/`write`/`offline_access`) and the remaining manual steps.
- [x] 1.3 `openspec validate b004-muse-oauth-callback --strict`.
