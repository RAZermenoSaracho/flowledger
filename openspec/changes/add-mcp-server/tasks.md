# Tasks

Prerequisite: `add-personal-api-keys` is implemented (provides `verifyCredential`, `utils/auditLog.ts`, the rate-limit factory, `PUBLIC_API_URL`, `trust proxy`).

## 1. Dependencies

- [x] 1.1 Bump `zod` to `^3.25` in `apps/api/package.json` and `packages/shared/package.json`; run `npm install` at the root; confirm `npm ls zod` shows one version and `npm run typecheck` passes
- [x] 1.2 Add `@modelcontextprotocol/sdk@^1.32` to `apps/api/package.json`; confirm `npm run build` and `npm run typecheck` still pass on Express 4

## 2. Shared schemas (`packages/shared`)

- [x] 2.1 Export `baseTransactionSchema` from `src/schemas/transactions.ts` (definition unchanged)
- [x] 2.2 Add `src/schemas/mcp.ts` with `transactionSearchFilterSchema` (strict; dateFrom/dateTo `YYYY-MM-DD`, accountId, categoryId, text 1..100, type, page default 1, pageSize 1..100 default 50) and `updateTransactionToolSchema` (`updateTransactionSchema` plus `id`); export from the schemas index
- [x] 2.3 Add `src/schemas/tests/mcp.test.ts` (defaults, pageSize 101 rejected, bad date rejected, unknown key rejected, update requires id)

## 3. MCP module (`apps/api/src/modules/mcp/`)

- [x] 3.1 `types/mcp.types.ts`: `McpAuth` (the SDK `AuthInfo` narrowed with `extra: { userId: string; kind: CredentialKind }`)
- [x] 3.2 `utils/transactionsQuery.ts` + `utils/tests/transactionsQuery.test.ts`: filter to datasieve JSON string per design D6; confirm operator spellings against `apps/web/src/utils/searchDomain.ts`
- [x] 3.3 `utils/toolResult.ts` + test: `ok`, `fail` (HttpError, ZodError, datasieve errors, unknown error is generic and logged)
- [x] 3.4 `utils/originGuard.ts` + test: Origin present gives 403, absent passes
- [x] 3.5 `utils/tokenVerifier.ts` + test: maps `VerifiedCredential` to `AuthInfo` (sentinel numeric `expiresAt`, `extra.userId/kind`); `HttpError(401)` from `verifyCredential` is mapped to `InvalidTokenError`; unexpected errors propagate unchanged
- [x] 3.6 `controllers/tools.controller.ts` + test (mock services): `registerTools` registers 4 tools for read, 6 for write; write handler refuses without `write` scope; reads call the right service with `auth.extra.userId` and no other identity; write handlers re-parse with `transactionSchema`/`updateTransactionSchema`, emit one `auditLog` per call on success and failure
- [x] 3.7 `controllers/mcp.controller.ts` + test: `postMcp` per-request server and stateless JSON transport, cleanup on close; `methodNotAllowed` returns 405 with `Allow: POST`
- [x] 3.8 `mcp.routes.ts`: limiter, `originGuard`, `requireBearerAuth({ verifier })` (no `resourceMetadataUrl`), POST and `all` handlers; mount `app.use("/mcp", mcpRouter)` in `apps/api/src/app.ts` before `errorHandler`

## 4. Integration tests (Docker/testcontainers via CLAUDE.local.md VM setup)

- [x] 4.1 `src/tests/integration/mcp.integration.test.ts`: start `app.listen(0)`; SDK `Client` + `StreamableHTTPClientTransport` with `requestInit.headers.Authorization`
- [x] 4.2 Cases: read key lists 4 tools; write key lists 6; read key calling `create_transaction` fails and creates nothing; write key creates and updates; cross-user isolation (A cannot read or update B's data, update of B's id is "Transaction not found"); web JWT 401; no header 401 with `WWW-Authenticate` lacking `resource_metadata`; revoked and expired keys 401; "never" key works; GET/DELETE 405; `Origin` header 403; no `Mcp-Session-Id`; `pageSize` 101 rejected
- [x] 4.3 Parity: for one seeded user, MCP `search_transactions`, `get_transaction_summary`, `list_accounts`, `list_categories` equal the internal REST responses (web JWT) after `serialize`; a refused case (foreign id) refused on both
- [x] 4.4 Audit: capture stdout; one audit line per write, no token and no amount in it
- [x] 4.5 After `add-public-rest-api-v1` is merged: add the same parity cases against `/v1` with an API key (skip until then)

## 5. Verification

- [x] 5.1 `npm run typecheck`, `npm run lint`, `npm run test` pass; integration suite passes with Docker
- [x] 5.2 Manual: MCP Inspector against local `http://localhost:4000/mcp` with a read key then a write key (tool lists, calls, error cases) (manual, left for staging)
  - Evidence: MCP Inspector CLI vs api-flowledger-dev /mcp: read key lists 4 tools, list_accounts returns data; write key lists 6; create_transaction with read key refused (tool_not_found).
- [ ] 5.3 Manual on `api-flowledger-dev.razs.dev`: `claude mcp add --transport http flowledger https://api-flowledger-dev.razs.dev/mcp --header "Authorization: Bearer fl_..."`; list accounts, search transactions, confirm a read key hides write tools; then revoke the key and confirm the next call fails (manual, left for staging)
  - Note: operator reported Claude and ChatGPT connected via MCP OAuth; the --header path and revoke were not reported (left open).
- [x] 5.4 Log any deferred findings in `docs/KNOWN_ISSUES.md`
