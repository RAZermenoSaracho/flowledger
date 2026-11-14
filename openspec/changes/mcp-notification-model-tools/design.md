# Design: mcp-notification-model-tools

## D1. One adapter file over existing services
The MCP tool controllers are adapters exactly like the REST controllers: each tool parses args with a shared schema and calls the service the matching REST controller calls (`createModel`, `updateModel`, `deleteModel`, `getModelById`, `listModels`, `validateCode`, `parseCodeToRules`, `testModel`, `publishModel`, `installModel`, `listLibrary`, `getLibraryModel`, `updateFromSource`). Ownership, publication, installation, and sandbox rules therefore stay in one place.

## D2. Code is the source of truth; rules are an input convenience
Agents may send `rules` instead of `code`. The tool converts them with the shared generator used by the web Form editor and persists only the resulting code. A custom script sent as `code` is stored verbatim; `parse_notification_rules` reports `unsupported` for scripts the Form cannot represent, exactly as the web does, so nothing is silently rewritten.

## D3. Dry-run test is a read tool
`test_notification_model` wraps `testModel`, which runs the draft code in the existing sandbox and returns the proposal without persisting runs or transactions. It is registered for read credentials with `readOnlyHint: true`.

## D4. Unpublish via update
`update_notification_model` with `visibility: "private"` unpublishes, mirroring the REST contract; making a model public is only possible through `publish_notification_model`.

## D5. Tool count
Library list and detail share one tool (`list_notification_library` with optional `modelId`), following `list_groups`. Queue/log tools are deferred until an agent workflow needs them.
