# Spec Delta

## MODIFIED Requirements

### Requirement: Component directories are for cohesive groups only
A directory under `components/` (other than the existing `ListView/`) SHALL exist only when it holds at least two cohesive source files, at least one of which is private to the directory, and SHALL contain an `index.ts` exporting only the public members. A component with no private member SHALL be a single flat file.

#### Scenario: Search bar directory
- **WHEN** `components/SearchBar/` is inspected
- **THEN** it has `SearchBar.tsx` plus private files (the filter builder and its condition editor), an `index.ts` exporting only `SearchBar` and `SearchBarQuery`, and its tests in `SearchBar/tests/`

#### Scenario: Form view directory
- **WHEN** `components/FormView/` is inspected
- **THEN** it has `FormView.tsx` plus the private `FormViewHeader.tsx` (back arrow, title block and header action slot), an `index.ts` exporting only `FormView`, and its tests in `FormView/tests/`. `EditableField`, `RelatedList`, `Tabs`, `ActionMenu` and `ModalDialog` stay flat because other contexts use them too.

#### Scenario: Single-file component stays flat
- **WHEN** a shared component has no private sibling file
- **THEN** it is a flat file in `components/` and no directory exists for it
