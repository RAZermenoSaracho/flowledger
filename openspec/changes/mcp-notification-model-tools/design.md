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
Library list and detail share one tool (`list_notification_library` with optional `modelId`), following `list_groups`. Queue and logs get no detail tool: the list rows already hold every public run field and the web has no detail view.

## D6. Queue and logs over the existing services
`list_notification_model_queue` and `list_notification_model_logs` call `listQueue` / `listLogs` unchanged, so ownership, the status subsets, the fixed orderings (queue oldest first by `receivedAt`, logs newest first by `finishedAt`), the 80-character queue text preview, 7-day text retention and stripped internal fields (`dedupeKey`, `workerId`) all stay as the web shows them. The tools accept a structured filter (`status` within the subset, `receivedFrom`/`receivedTo`, `page`, `pageSize` ≤ 100) that a small util compiles to the DSQL query, as `search_transactions` does. Both are read tools and never enqueue, retry, cancel or change a run.
