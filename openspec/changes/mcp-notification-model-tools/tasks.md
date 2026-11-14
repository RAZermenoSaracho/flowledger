# Tasks

## 1. Shared schemas
- [x] 1.1 Add `packages/shared/src/schemas/mcpNotificationModels.ts` (tool input schemas, `code`/`rules` exclusivity) and export it
- [x] 1.2 Add `packages/shared/src/schemas/tests/mcpNotificationModels.test.ts`

## 2. MCP tools
- [x] 2.1 Add `tools.notificationModels.controller.ts` with the six read and six write tools over existing services
- [x] 2.2 Wire into `tools.controller.ts`
- [x] 2.3 Add `tests/tools.notificationModels.controller.test.ts` (registration by scope, service calls with credential user, rules→code parity, exclusivity, write refused for read credential)
- [x] 2.4 Add `src/tests/integration/mcp.notificationModels.integration.test.ts` (real sandbox and Postgres: CRUD, dry-run creates nothing, rules round trip, isolation, publish/install/unpublish, delete)

## 3. Queue and logs read tools
- [ ] 3.1 Add `notificationQueueToolSchema` / `notificationLogsToolSchema` to the shared MCP schemas, with tests
- [ ] 3.2 Add `mcp/utils/notificationRunsQuery.ts` (structured filter → DSQL), with tests
- [ ] 3.3 Register `list_notification_model_queue` and `list_notification_model_logs` over `listQueue` / `listLogs`, with unit tests
- [ ] 3.4 Integration: real ingest → queue listed; processed → logs (completed, skipped, filters, pagination); foreign model not found; reading changes nothing
- [ ] 3.5 Docs and tool counts updated
- [ ] 3.6 Staging MCP acceptance for queue and logs, then stop staging and clean up

## 4. Docs and verification
- [x] 4.1 Document the tools in `docs/NOTIFICATION_MODELS.md`
- [x] 4.2 `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`
- [x] 4.3 `openspec validate mcp-notification-model-tools --strict`
- [x] 4.4 Real MCP acceptance run on staging with a demo account, then stop staging and clean up
