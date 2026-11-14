# Proposal: mcp-notification-model-tools

## Why

Notification Models (B-007) are fully manageable in the web app, but the MCP server registers no tool for them. An authenticated AI agent therefore cannot create a model, write its Python script, preview it against sample notifications, or publish/install library models, even though every operation already exists as a service behind the REST routes.

## What Changes

- Add `apps/api/src/modules/mcp/controllers/tools.notificationModels.controller.ts` registering twelve tools that call the **existing** notification-model services (no new business logic, sandbox, or rule engine):
  - Read (every credential): `list_notification_models`, `get_notification_model`, `list_notification_library`, `validate_notification_code`, `parse_notification_rules`, `test_notification_model`.
  - Write (`write` scope only, audited through `runWrite`): `create_notification_model`, `update_notification_model`, `delete_notification_model`, `publish_notification_model`, `install_notification_model`, `update_notification_model_from_source`.
- `create_notification_model` / `update_notification_model` accept either `code` or Form-editor `rules` (never both). Rules are turned into code with the same shared generator the web Form editor uses, so the saved script stays the single source of truth.
- Add tool input schemas to `@flowledger/shared` (`schemas/mcpNotificationModels.ts`).
- Document the tools in `docs/NOTIFICATION_MODELS.md`.

## Capabilities

### New Capabilities
- `mcp-notification-model-tools`: MCP management of notification models, scripts, dry-run tests and library operations.

### Modified Capabilities
<!-- none -->

## Non-goals

- Ingesting real notifications through MCP (the existing ingest endpoint remains the only path that creates runs).
- Run queue/log inspection tools.
- Any change to the sandbox, the rule generator/parser, publication or installation semantics, or the data model.
