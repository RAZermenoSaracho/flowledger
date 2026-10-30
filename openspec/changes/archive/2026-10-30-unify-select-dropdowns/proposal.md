# Proposal

## Why

Select controls currently vary between native browser widgets, a custom searchable multiselect, and currency-specific controls, producing inconsistent appearance and interaction. A shared dropdown presentation will make controls feel coherent while retaining each field's existing value shape and selection meaning.

## What Changes

- Introduce a shared dropdown presentation for single-value, multi-value, and searchable selection, using existing React and lucide-react dependencies.
- Migrate current native selects and the Reports multiselect to the shared presentation, preserving option values, labels, empty/default behavior, disabled state, and callback semantics. In SearchBar and SearchComponent, adapt only actual selectable fields while preserving search inputs and all search behavior; standalone/global/table search bars and ordinary text inputs are excluded.
- Keep single-select fields single-select; no field may become multiselect as a visual side effect.
- Apply the same visual treatment to currency selection without changing currency loading, preference, or transaction semantics.
- Specify consistent focus, hover, selected, disabled, open, and empty states; keyboard operation, accessible labeling, responsive sizing, and light/dark themes.

## Capabilities

### New Capabilities
- `select-dropdowns`: Consistent accessible dropdown presentation for existing single, multi, and searchable select fields.

### Modified Capabilities

## Impact

- Frontend: `apps/web/src/components/FormField.tsx`, `CurrencySelect.tsx`, `FilterBuilder.tsx`, selectable fields within `SearchBar.tsx` and `SearchComponent.tsx` (presentation only), and consumers listed in design.md; Reports `MultiSelectFilter.tsx` and `ReportFiltersCard.tsx`. Standalone/global/table search bars and ordinary text inputs are excluded and must retain existing behavior.
- Tests: existing component interaction tests plus focused keyboard, semantics, theme, responsive, and preservation coverage.
- Dependencies and APIs: no new dependency or backend/API change planned.
- Scope excludes profile header layout and currency/date relocation; the Profile theme selector is included only as a select control.
