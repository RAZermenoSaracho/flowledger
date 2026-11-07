# Proposal: add-mcp-server

## Why

AI clients (Claude Code today, ChatGPT later) cannot reach FlowLedger data. Personal API keys (`add-personal-api-keys`) now let a user mint a scoped credential; this change gives that credential a first consumer that AI clients speak natively: a remote MCP server at `${PUBLIC_API_URL}/mcp`. It exposes a deliberately tiny, safe surface (four read tools, two opt-in write tools) by calling the **existing** services, so ownership rules and validation stay in one place.

## What Changes

- Add a stateless Streamable HTTP MCP endpoint, `POST /mcp`, in a new module `apps/api/src/modules/mcp/`. `GET /mcp` and `DELETE /mcp` return 405.
- Authenticate `/mcp` with the SDK's `requireBearerAuth({ verifier })`, where the verifier wraps `verifyCredential` (from `add-personal-api-keys`). Web JWTs are rejected with 401 + `WWW-Authenticate`.
- Register exactly six tools: `list_accounts`, `list_categories`, `search_transactions`, `get_transaction_summary` (read) and `create_transaction`, `update_transaction` (write; registered only for credentials with the `write` scope and re-checked in the handler).
- Add the structured transaction filter schema (and tool input schemas that are not already in the codebase) to `@flowledger/shared`.
- Add a request `Origin` guard, a rate limiter on `/mcp`, `isError` mapping for service errors, and one audit log line per write.
- Bump `zod` to `^3.25` in `apps/api` and `packages/shared` (peer requirement of the SDK; no code change) and add `@modelcontextprotocol/sdk@^1.32` to `apps/api`.
- **Requirement on this adapter:** it reads identity and scopes only from `req.auth`. `add-mcp-oauth` will then add OAuth access tokens purely by extending `verifyCredential`, with zero changes to anything in `modules/mcp/`.

## Capabilities

### New Capabilities
- `mcp-server`: authenticated, scope-gated remote MCP endpoint exposing six FlowLedger tools over existing services.

### Modified Capabilities
<!-- none -->

## Non-goals

- OAuth, protected-resource metadata, discovery endpoints, `resource_metadata` in `WWW-Authenticate` (all `add-mcp-oauth`).
- Sessions, SSE streaming, server-initiated messages, resources, prompts, sampling.
- Any tool beyond the six: no delete, no account/category writes, no groups, shared expenses, debts, settlements, reports, imported-transaction review.
- A new service layer, new authorization layer, new Prisma model or migration.
- `outputSchema` declarations (see design).

## Design summary

Full detail in `design.md`. Module layout (no service layer; tools call existing services):

```
apps/api/src/modules/mcp/
  mcp.routes.ts                    limiter -> originGuard -> requireBearerAuth -> POST handler; GET/DELETE -> 405
  controllers/mcp.controller.ts    postMcp (per-request McpServer + transport), methodNotAllowed
  controllers/tools.controller.ts  registerTools(server, auth): the six tool handlers (thin)
  utils/tokenVerifier.ts           OAuthTokenVerifier wrapping verifyCredential -> AuthInfo
  utils/originGuard.ts             reject present Origin header with 403
  utils/transactionsQuery.ts       structured filter -> datasieve query JSON string
  utils/toolResult.ts              success / error -> CallToolResult (HttpError, ZodError, datasieve errors)
  types/mcp.types.ts               McpAuth, tool context types
  (each with sibling tests/)
packages/shared/src/schemas/mcp.ts   transactionSearchFilterSchema, updateTransactionToolSchema
```

### Tool table

| Tool | Scope | Input | Calls | Annotations |
|---|---|---|---|---|
| `list_accounts` | read | `{}` | `listAccounts(userId, undefined)` | readOnlyHint |
| `list_categories` | read | `{}` | `listCategories(userId, {}, undefined)` | readOnlyHint |
| `search_transactions` | read | `transactionSearchFilterSchema` | `listTransactions(userId, buildQuery(filter))` | readOnlyHint |
| `get_transaction_summary` | read | `transactionSearchFilterSchema` without `page`/`pageSize` | `getTransactionsSummary(userId, buildQuery(filter))` | readOnlyHint |
| `create_transaction` | write | shared transaction object schema (re-validated with `transactionSchema`) | `createTransaction(userId, body)` | none |
| `update_transaction` | write | `{ id }` + `updateTransactionSchema` fields | `updateTransaction(userId, id, body)` | idempotentHint |

`transactionSearchFilterSchema` (all optional): `dateFrom`, `dateTo` (`YYYY-MM-DD`), `accountId`, `categoryId`, `text` (max 100), `type` (`income|expense|transfer`), `page` (int >=1, default 1), `pageSize` (int 1..100, default 50).

## Requirements overview (full text in `specs/mcp-server/spec.md`)

Claude Code connects with `--header`; a read key never sees write tools; a read key calling a write tool is refused; users are isolated from each other; MCP results match the REST results for the same user and input.

## Security

- **Prompt injection:** tools return structured data only (`structuredContent` + the same JSON as text). Tool descriptions are static. No output ever contains instructions, URLs to follow, or free-form guidance; user-authored strings (transaction names, notes) are data fields inside JSON and are never concatenated into prose.
- **Scope minimization:** default key scope is `read`; write tools do not exist on the wire for read credentials, and the handler re-checks the scope. No DELETE or account writes exist at all.
- **No token passthrough:** the bearer token is verified by FlowLedger itself and used only to resolve identity. It is never forwarded to any other service, never logged, and never placed into tool output. `AuthInfo.token` is not read by tools.
- **Identity** comes only from the verified credential; tool inputs never carry a user id. Ownership is enforced by the existing services' Prisma `where` clauses.
- Web JWTs are rejected; `Origin` present means 403 (DNS-rebinding / browser-abuse defence); rate limit on `/mcp`; audit line on every write, no secrets or bodies in it.

## Acceptance (canonical section 8, change 3)

- Claude Code connects with `--header "Authorization: Bearer fl_..."` and can list and call tools.
- A read-only key does not see write tools and cannot call them.
- Users stay isolated from each other.
- REST/MCP parity: for the same user and input, MCP and REST return the same data or the same refusal.

## Tests

- In-process SDK `Client` + `StreamableHTTPClientTransport` against `app.listen(0)` over testcontainers Postgres (`apps/api/src/tests/integration/mcp.integration.test.ts`).
- Parity: MCP results compared with the existing internal REST routes (`/transactions`, `/accounts`, ...) for the same user. This does not depend on `add-public-rest-api-v1`; a `/v1` parity case is added once that change is merged (see design D9).
- Unit tests (mockDeep Prisma where services are touched): filter mapping, token verifier, tool result mapping, origin guard, tool controller scope gating.
- Shared schema tests for the new schemas.
- Manual: MCP Inspector, then real Claude Code against `https://api-flowledger-dev.razs.dev/mcp`.

## Dependencies

- **Requires `add-personal-api-keys`** (`verifyCredential`, `VerifiedCredential`, `utils/auditLog.ts`, the rate-limit factory, `PUBLIC_API_URL`, `trust proxy`). Cannot be applied before it.
- `add-public-rest-api-v1` is **not** required (only an optional extra parity case).
- Blocks `add-mcp-oauth`.

## Impact

- New: `apps/api/src/modules/mcp/**`, `packages/shared/src/schemas/mcp.ts` (+ export + test), integration test.
- Edited: `apps/api/src/app.ts` (one `app.use("/mcp", mcpRouter)`), `apps/api/package.json` and `packages/shared/package.json` (deps), `packages/shared/src/schemas/transactions.ts` (export the pre-refinement object schema).
- No database change, no env var change, no deploy change.
