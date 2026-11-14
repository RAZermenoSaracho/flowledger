# Tasks

## 1. Shared schemas
- [x] 1.1 Add `packages/shared/src/schemas/mcpNotificationModels.ts` (tool input schemas, `code`/`rules` exclusivity) and export it
- [x] 1.2 Add `packages/shared/src/schemas/tests/mcpNotificationModels.test.ts`

## 2. MCP tools
- [x] 2.1 Add `tools.notificationModels.controller.ts` with the six read and six write tools over existing services
- [x] 2.2 Wire into `tools.controller.ts`
- [x] 2.3 Add `tests/tools.notificationModels.controller.test.ts` (registration by scope, service calls with credential user, rules→code parity, exclusivity, write refused for read credential)
- [x] 2.4 Add `src/tests/integration/mcp.notificationModels.integration.test.ts` (real sandbox and Postgres: CRUD, dry-run creates nothing, rules round trip, isolation, publish/install/unpublish, delete)

## 3. Docs and verification
- [x] 3.1 Document the tools in `docs/NOTIFICATION_MODELS.md`
- [x] 3.2 `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`
- [x] 3.3 `openspec validate mcp-notification-model-tools --strict`
- [x] 3.4 Real MCP acceptance run on staging with a demo account, then stop staging and clean up
