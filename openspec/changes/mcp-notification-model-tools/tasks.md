# Tasks

## 1. Shared schemas
- [ ] 1.1 Add `packages/shared/src/schemas/mcpNotificationModels.ts` (tool input schemas, `code`/`rules` exclusivity) and export it
- [ ] 1.2 Add `packages/shared/src/schemas/tests/mcpNotificationModels.test.ts`

## 2. MCP tools
- [ ] 2.1 Add `tools.notificationModels.controller.ts` with the six read and six write tools over existing services
- [ ] 2.2 Wire into `tools.controller.ts`
- [ ] 2.3 Add `tests/tools.notificationModels.controller.test.ts` (registration by scope, service calls with credential user, rules→code parity, exclusivity, write refused for read credential)

## 3. Docs and verification
- [ ] 3.1 Document the tools in `docs/NOTIFICATION_MODELS.md`
- [ ] 3.2 `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`
- [ ] 3.3 `openspec validate mcp-notification-model-tools --strict`
- [ ] 3.4 Real MCP acceptance run on staging with a demo account, then stop staging and clean up
