# web-component-organization Specification

## Purpose
Defines checkable structural rules for the web app's shared layer so that shared components stay model-agnostic, discoverable and small, and so that common behaviours live in one shared hook instead of per-component copies.

## Requirements

### Requirement: Shared components do not depend on pages
Source files under `apps/web/src/components/` SHALL NOT import from `apps/web/src/pages/`. Test files are exempt.

#### Scenario: No upward import
- **WHEN** the non-test files under `components/` are searched for imports resolving into `pages/`
- **THEN** there are none

### Requirement: Model-specific UI lives in its model's page module
UI and hooks specific to one domain model (categories, transactions) SHALL live in that model's page module under `pages/<Model>/components/` or `pages/<Model>/hooks/`. Other page modules SHALL import them from there, not through `components/`.

#### Scenario: Category UI location
- **WHEN** the category card and category form are located
- **THEN** they are in `pages/Categories/components/` and the Groups page module imports them from that path

#### Scenario: Related transactions location
- **WHEN** the related-transactions list and its data hook are located
- **THEN** they are in `pages/Transactions/components/` and `pages/Transactions/hooks/`, and the Groups and Accounts detail pages import them from there

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

### Requirement: Component directories are imported through their index
Code outside a component directory SHALL import from the directory path (its `index.ts`), never from a file inside it. Tests inside the directory's own `tests/` folder are exempt.

#### Scenario: No deep import
- **WHEN** non-test files outside `components/SearchBar/` and `components/ListView/` are searched for imports of a path inside those directories
- **THEN** there are none

### Requirement: Outside-click and Escape dismissal uses the shared hook
Popups that close on a pointer press outside them or on Escape SHALL use the shared dismissal hook rather than a hand-rolled document listener. Pressing outside closes, pressing Escape closes, and pressing inside leaves the popup open.

#### Scenario: Click outside closes
- **WHEN** the action menu, the search filter panel or the currency select is open and the user presses outside it
- **THEN** it closes

#### Scenario: Escape closes
- **WHEN** one of those popups is open and the user presses Escape
- **THEN** it closes (the currency select also clears its typed query)

#### Scenario: Click inside stays open
- **WHEN** one of those popups is open and the user presses inside it
- **THEN** it stays open

#### Scenario: No duplicate listeners
- **WHEN** `components/` is searched for `addEventListener("pointerdown"` or `addEventListener("mousedown"`
- **THEN** only the shared dismissal hook matches

### Requirement: Highlighted-record scroll uses the shared hook
Pages that scroll a deep-linked record into view SHALL use the shared scroll-to-highlight hook. Once data has finished loading and a target element id exists, the element SHALL be scrolled to the vertical centre of the viewport smoothly; nothing happens while loading, when there is no target, or when no element has that id.

#### Scenario: Deep link scrolls
- **WHEN** a debts, person-debt or shared-expenses page loads with a highlighted record id and its list has loaded
- **THEN** the matching element is scrolled into view centred and smoothly

#### Scenario: Still loading
- **WHEN** the list is still loading
- **THEN** no scroll is attempted
