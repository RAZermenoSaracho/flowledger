## ADDED Requirements

### Requirement: Notification model tool set
The MCP server SHALL register for every credential `list_notification_models`, `get_notification_model`, `list_notification_library`, `validate_notification_code`, `parse_notification_rules` and `test_notification_model` (all `readOnlyHint: true`), and only for credentials holding `write`: `create_notification_model`, `update_notification_model`, `delete_notification_model`, `publish_notification_model`, `install_notification_model` and `update_notification_model_from_source`. `delete_notification_model` SHALL carry `destructiveHint: true`. No MCP tool SHALL ingest a notification.

#### Scenario: Read credential
- **WHEN** a read-only credential lists tools
- **THEN** the six read tools are present and none of the six write tools

#### Scenario: Write credential
- **WHEN** a write credential lists tools
- **THEN** all twelve notification model tools are present

### Requirement: Tools reuse notification model services
Every notification model tool SHALL act only as the credential's user by calling the same service as the matching REST route. Another user's private model SHALL return not found.

#### Scenario: Foreign model
- **WHEN** a credential calls `get_notification_model` with another user's private model id
- **THEN** the result is a not-found error

#### Scenario: Read credential calls a write tool
- **WHEN** a read-only credential calls `create_notification_model`
- **THEN** it is refused with a missing-scope error and nothing is created

### Requirement: Script source of truth
`create_notification_model` and `update_notification_model` SHALL accept either `code` or `rules`, never both. When `rules` is given, the stored code SHALL equal the code the web Form editor generates for the same rules. Code sent as `code` SHALL be stored unchanged.

#### Scenario: Rules input
- **WHEN** an agent creates a model with `rules`
- **THEN** the saved code equals the shared generator's output for those rules

#### Scenario: Both inputs
- **WHEN** an agent sends both `code` and `rules`
- **THEN** the call fails validation and nothing is saved

### Requirement: Dry-run test creates nothing
`test_notification_model` SHALL run the model's saved code, or the supplied draft `code`/`settings`, in the existing sandbox against sample text and return the proposal or errors without creating runs or transactions.

#### Scenario: Purchase preview
- **WHEN** an agent tests a purchase notification against a model whose script calls `expense()`
- **THEN** the result contains an expense proposal and no transaction or run exists afterwards

### Requirement: Library operations keep publication semantics
`publish_notification_model` SHALL publish only the caller's own model; `install_notification_model` SHALL create a private copy owned by the caller; `update_notification_model` with `visibility: "private"` SHALL unpublish. No tool SHALL modify another publisher's model.

#### Scenario: Publish foreign model
- **WHEN** a credential calls `publish_notification_model` on a model it does not own
- **THEN** the result is not found and nothing is published
