# Tasks

## 1. Shared dropdown foundation

- [x] 1.1 Implement shared Tailwind trigger styling for native single-selects and a shared custom menu shell only for multi/search modes; verify custom menu tests cover open/close, arrows, selection, Escape, focus visibility, and ARIA semantics.
- [x] 1.2 Adapt `FormField.SelectField` and `CurrencySelect` while preserving values, labels, loading, disabled, and no-preference behavior; verify existing and added component tests pass.

## 2. Migrate existing controls

- [x] 2.1 Migrate `FilterBuilder`, `SearchBar`, and `SearchComponent` select controls; verify current filtering and saved value behavior remains covered by focused tests. Search inputs and search behavior remain unchanged.
- [x] 2.2 Migrate Reports `MultiSelectFilter` and `ReportFiltersCard` currency selector; verify search, multi-toggle, select-all, clear, no-results, and currency callback cases.
- [x] 2.3 Audit and migrate select consumers in Transactions, Accounts, Categories, Groups, Debts, SharedExpenses, and Profile preferences; verify each retains its prior single/multi semantics and Profile header layout is unchanged.

## 3. Accessibility and responsive verification

- [x] 3.1 Add focused tests for theme styling, disabled/empty options, responsive CSS constraints, accessible names, native popup exemption, and single-vs-multi semantics; verify with the web component test runner. Actual 375px and 1280px rendering requires manual browser review because jsdom does not perform layout.
- [x] 3.2 Run relevant web tests, typecheck, and lint; record outcomes and resolve regressions before implementation is considered complete.

## Validation

- Full frontend coverage run: 131 files, 930 tests passed; configured coverage thresholds passed (92.42% statements, 86.90% branches, 89.55% functions, 93.26% lines).
- Repository lint and typecheck passed; frontend build passed with the existing large-chunk advisory.
- Shared schemas: 203 tests passed. API: 1,191 tests passed; 22 database-backed suites could not start because Docker is unavailable (217 tests skipped). No API files were changed.
- SearchBar, SearchComponent, ordinary TextInput implementation, and standalone search functionality remain unchanged; existing search regression tests passed in the full frontend run.
- Browser viewport/theme rendering remains a manual review at 375px and 1280px; no browser visual verification is claimed.
