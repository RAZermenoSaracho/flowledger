# Design: add-mcp-server

## Context

- Express 4 app (`apps/api/src/app.ts`), routes mounted with `app.use(path, [requireAuth,] router)`; global `helmet`, `cors({origin: WEB_APP_URL})`, `express.json({limit:"1mb"})` already run before any router, so `req.body` is parsed when `/mcp` is reached.
- Existing services (all take `userId` first, enforce ownership in Prisma `where`, throw `HttpError`/`ZodError`/datasieve errors):
  - `listAccounts(userId, rawQuery?)` (accounts/services/read.service.ts)
  - `listCategories(userId, scope:{groupId?,scope?}, rawQuery?)` (categories/services/read.service.ts)
  - `listTransactions(userId, rawQuery?)`, `getTransactionsSummary(userId, rawQuery?)` (transactions/services/read.service.ts); `rawQuery` is a JSON string `{where, sort, pagination}` in DSQL. With no `pagination` the list is unpaginated, so the adapter must always send one.
  - `createTransaction(userId, body)`, `updateTransaction(userId, id, body)` (transactions/services; `body: any`, validated upstream by `transactionSchema` / `updateTransactionSchema`, which the controllers' `validate()` middleware applies today).
- `transactionSchema` is a `ZodEffects` (has `superRefine`); `updateTransactionSchema` is a plain `ZodObject` (`omit().partial()`); `baseTransactionSchema` is not exported.
- SDK facts verified in `sdk-spike-findings.md` (sdk 1.32.2 on Express 4, Node 24): stateless per-request `McpServer` + `StreamableHTTPServerTransport` works; transport reads `req.auth` and exposes it as `extra.authInfo`; the verifier must throw the SDK's `InvalidTokenError` (a plain `Error` becomes 500); `zod` must be `^3.25`; `requireBearerAuth` appends `resource_metadata` to `WWW-Authenticate` only when `resourceMetadataUrl` is passed.
- Additionally verified in SDK source (`bearerAuth.js`): `requireBearerAuth` rejects any `AuthInfo` whose `expiresAt` is not a number ("Token has no expiration time"). `VerifiedCredential` (shared contract) carries no expiry and "never" credentials have none.

## Goals / Non-Goals

**Goals:** six tools over existing services; identity only from `req.auth`; scope-gated write tools; no new layer; OAuth later with zero adapter change.

**Non-Goals:** see proposal (OAuth, discovery, sessions, SSE, more tools, outputSchema).

## Decisions

### D1. Module layout (minimal, file-role compliant)
Tool handlers parse input, call a service and shape the result, which is exactly the controller role, so they live in `controllers/`. No `services/` folder is created because nothing in this module owns business logic. Pure helpers are `utils/`; the `McpAuth` type is in `types/`.

```
modules/mcp/
  mcp.routes.ts
  controllers/mcp.controller.ts      postMcp, methodNotAllowed
  controllers/tools.controller.ts    registerTools(server, auth)
  utils/tokenVerifier.ts  utils/originGuard.ts  utils/transactionsQuery.ts  utils/toolResult.ts
  types/mcp.types.ts
```
The routes file is wiring only. Rejected: a `tools/` folder with one file per tool (six tiny files, no gain); a `mcp.service.ts` (a pass-through layer the contract forbids).

### D2. Auth: `requireBearerAuth({ verifier })`
`tokenVerifier.ts` exports `credentialTokenVerifier: OAuthTokenVerifier` whose `verifyAccessToken(token)` calls `verifyCredential(token)` and returns
`{ token, clientId: credentialId, scopes, expiresAt, extra: { userId, kind } }`.
- `verifyCredential` (add-personal-api-keys) throws `HttpError(401)` for any rejected credential and has no SDK dependency. The verifier maps `HttpError` with status 401 to the SDK's `InvalidTokenError`; any other thrown error is rethrown unchanged (SDK maps it to 500, so DB outages are not misreported as 401).
- **`expiresAt` sentinel:** the SDK demands a numeric `expiresAt`. Verification hits the database on every request, so the SDK's expiry check is redundant; the verifier sets `expiresAt = now + 60 s`. This avoids touching `verifyCredential`'s contract. (Alternative: add `expiresAt` to `VerifiedCredential`; rejected because it changes another change's contract for no behavioural gain. If add-personal-api-keys exposes it anyway, the verifier may pass the real value, with the sentinel only for `never`.)
- Web JWT: `verifyCredential` rejects any prefix other than `fl_` (and later `flo_`), so a JWT yields 401 with `WWW-Authenticate: Bearer error="invalid_token", error_description="..."`.
- `resourceMetadataUrl` and `expectedResource` options are deliberately **not passed**. `add-mcp-oauth` adds them in `mcp.routes.ts` (a one-line routes edit) when it publishes PRM metadata; the adapter/controllers do not change. This is the only anticipated routes-file touch and is acceptable because routes are wiring. If the OAuth change prefers zero edits under `modules/mcp/`, `resourceMetadataUrl` may be read from `env` here later; recorded as an open question.
- `requiredScopes` is not used: every credential has `read`, and write is enforced per tool.

### D3. Per-request server, stateless, JSON responses
`postMcp` builds `new McpServer({name:"flowledger", version})`, calls `registerTools(server, req.auth)`, creates `new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })`, connects, and `await transport.handleRequest(req, res, req.body)`. On `res.on("close")` it closes transport and server. `req.auth` absent (should be impossible behind the bearer middleware) yields a 401. GET and DELETE: a shared `methodNotAllowed` sets `Allow: POST` and returns 405 with a JSON-RPC style error body. JSON mode avoids Cloudflare's ~100 s idle limit.

### D4. Tool registration and scope gating
`registerTools(server, auth)` registers the four read tools always. If `auth.scopes.includes("write")` it also registers the two write tools. Each write handler additionally checks `auth.scopes.includes("write")` and returns an error result otherwise (defence in depth if registration logic regresses). `userId` is closed over from `auth.extra.userId`; tool schemas contain no user field. Annotations: `readOnlyHint: true` on reads; `idempotentHint: true` on `update_transaction`; `destructiveHint` left at default for create.

### D5. Tool schemas (in `@flowledger/shared`)
- `list_accounts`, `list_categories`: empty input (`{}`), called as `listAccounts(userId, undefined)` and `listCategories(userId, {}, undefined)`. The existing `?query` DSQL is not exposed to the model.
- `transactionSearchFilterSchema` in `packages/shared/src/schemas/mcp.ts`:
  `dateFrom?` and `dateTo?` (`YYYY-MM-DD` regex), `accountId?`, `categoryId?` (non-empty strings), `text?` (trim, 1..100), `type?` (`z.enum(TRANSACTION_TYPES)`), `page?` (int >=1, default 1), `pageSize?` (int 1..100, default 50). `.strict()` so unknown keys fail rather than being silently ignored.
- `get_transaction_summary` input: `transactionSearchFilterSchema.omit({page,pageSize})`.
- `create_transaction` input: the raw `baseTransactionSchema` object (newly exported from `schemas/transactions.ts`, unchanged definition) so the SDK can advertise a JSON Schema; the handler re-parses with the authoritative `transactionSchema` (adds the transfer/shared-expense refinements). Same rules as web, one source of truth.
- `update_transaction` input: `updateTransactionSchema.extend({ id: z.string().min(1) })` exported as `updateTransactionToolSchema`. The handler splits `id` from the body and calls `updateTransactionSchema.parse(rest)` to keep strictness identical to REST.

### D6. Filter to datasieve (`utils/transactionsQuery.ts`)
`buildTransactionsQuery(filter): string` returns `JSON.stringify({ where, sort, pagination })`:
- `where`: `{ and: [...] }` of present conditions (omitted when none): `dateFrom` -> `{field:"date",op:">=",value:dateFrom}`; `dateTo` -> `{field:"date",op:"<=",value:dateTo + "T23:59:59.999Z"}` (inclusive day); `accountId` -> `{field:"accountId",op:"=",value}`; `categoryId` likewise; `type` -> `{field:"type",op:"=",value}`; `text` -> `{field:"name",op:"contains",value}` (name only).
- `sort`: `[{field:"date",direction:"desc"}]`. `pagination`: `{kind:"offset",page,pageSize}` (summary omits sort/pagination). Fields/ops are the same ones the web `searchDomain.ts` already sends, so datasieve validation is unchanged; the implementer confirms the exact operator spellings (`>=`, `<=`, `contains`) against `apps/web/src/utils/searchDomain.ts` and fixes the util if they differ. The service adds the `userId` condition itself, so the adapter cannot widen scope.
- Output size: `pageSize` cap 100 bounds responses.

### D7. Results and errors (`utils/toolResult.ts`)
- `ok(data)`: `{ content:[{type:"text", text: JSON.stringify(serialize(data))}], structuredContent: serialize(data) }`. Arrays are wrapped in objects (`{accounts}`, `{categories}`, `{data, meta}`, `{transaction}`) because `structuredContent` must be an object. `serialize()` converts `Decimal`s.
- `fail(error)`: `HttpError` -> `isError:true`, text = its message; `ZodError` -> `"Validation failed: <flattened issues>"`; datasieve `ParseError`/`QueryValidationError` -> its message; anything else -> `console.error` and `"Internal error"`. Mirrors `errorHandler.ts`.
- No `outputSchema`: the spike showed the client validates `structuredContent` strictly against it, and Prisma record shapes (relations, extra columns) would make that brittle. Typed output is deferred.
- Every text field is JSON of data; no sentences of guidance are ever emitted.

### D8. Origin, limiter, mounting
`mcp.routes.ts`: `router.use(mcpLimiter, originGuard, requireBearerAuth(...))`, then `router.post("/", asyncHandler(postMcp))`, `router.all("/", methodNotAllowed)`. `app.ts` mounts it with `app.use("/mcp", mcpRouter)` before `errorHandler`. The limiter is the factory from `add-personal-api-keys` (keyed by credential hash or IP), placed first so unauthenticated floods are also limited.
`originGuard`: if an `Origin` header exists return 403, else `next()`. Justification: legitimate callers are server-side or CLI (Claude Code, ChatGPT's backend, MCP Inspector's proxy) and send no `Origin`; browsers always do, so the allowlist is empty and no configuration is needed. A browser-resident MCP client would be a future opt-in. The app-level `cors()` (WEB_APP_URL only) already omits CORS headers for other origins; the guard is an additional explicit server-side refusal (MCP spec: validate `Origin` against DNS rebinding).

### D9. Audit and parity test decision
- Writes call `auditLog({ userId, credentialKind: kind, credentialId, op: "mcp.create_transaction" | "mcp.update_transaction", resourceId, status })` from `utils/auditLog.ts` (add-personal-api-keys), once per call in both success and failure paths (`status` = HTTP-equivalent code: 201/200, `HttpError.statusCode`, or 500). Never log inputs or tokens.
- **Parity test:** compare MCP against the **existing internal REST routes** (`GET /transactions?query=`, `/transactions/summary`, `/accounts`, `/categories`) authenticated with a web JWT for the same user (the test helper `authTestUser` already exists), over testcontainers. Rationale: `/v1` reuses exactly those controllers and services, so parity with them is parity with `/v1`, and this removes a dependency on add-public-rest-api-v1 landing first (the two changes are parallel tracks). A task adds an extra `/v1` parity case, guarded to be enabled only after `add-public-rest-api-v1` is merged.

### D10. Dependencies
`@modelcontextprotocol/sdk@^1.32` in `apps/api`; `zod` `^3.25` in `apps/api` and `packages/shared`, after which `npm ls zod` must show a single version. The SDK's nested Express 5 and `express-rate-limit` resolve without conflict (spike).

## Risks / Trade-offs

- **Prompt injection through stored text** (transaction names/notes can contain attacker text, e.g. from a bank import): mitigated by structure-only outputs and static descriptions; the residual risk (a model obeying text inside a JSON field) is inherent to MCP and is bounded by scope minimization: a read credential cannot change anything, and no delete or account tools exist.
- **Write via MCP without idempotency:** retries can duplicate; deferred per canonical section 9 until seen in the audit logs.
- **SDK v1 on Express 4 relies on a nested Express 5 only for the unused auth router:** acceptable; revisit with SDK v2.
- **`expiresAt` sentinel** is a workaround for an SDK requirement; documented in the verifier.
- **Operator spelling in filter mapping** is verified at implementation (D6).
- Open question: whether `add-mcp-oauth` is allowed a one-line edit to `mcp.routes.ts` (to pass `resourceMetadataUrl`). The adapter itself (controllers/utils) needs none.

## Simplicity audit

Result of the ponytail pass (six-tool surface, layers, file count):

- KEEP: the six tools (each maps to one existing service call; fewer would drop a contract tool); no `services/` layer (tools call existing services); `originGuard`, `tokenVerifier`, `toolResult`, `transactionsQuery` as separate small utils (each independently testable, security-relevant or pure logic); `types/mcp.types.ts` (shared by three files, file-role rule).
- SIMPLIFY (applied): `text` filter matches `name` only (no `or` over `notes`), one condition fewer and no cross-column OR; `list_accounts`/`list_categories` take no input, so the model cannot send raw datasieve queries.
- DEFER: `outputSchema`, idempotency keys, sessions/SSE, `/v1` parity case until `add-public-rest-api-v1` merges, `resourceMetadataUrl`/`expectedResource` until `add-mcp-oauth`.
- REMOVE: no per-tool files, no `McpServer` factory abstraction, no config for allowed origins (empty allowlist), no extra env vars, no `requiredScopes` plumbing.
