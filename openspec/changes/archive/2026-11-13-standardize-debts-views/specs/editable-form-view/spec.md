# Spec Delta

## ADDED Requirements

### Requirement: Form View without a draft
`FormView` SHALL accept being rendered without a draft, for a record view that has nothing editable at the record level. Without a draft it SHALL render the same header, the back arrow, the tabs, the children and the record-actions menu. It SHALL NOT render Save or Cancel, SHALL NOT register the save shortcut, and its back arrow SHALL navigate without asking for confirmation. Rendering with a draft SHALL behave exactly as before.

#### Scenario: Read-only record header
- **WHEN** a record view renders `FormView` with a title and a back link but no draft
- **THEN** the back arrow and title are shown, no Save or Cancel control is rendered, and activating the back arrow navigates immediately
