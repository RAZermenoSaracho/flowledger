# Design

## Context

`FormField.tsx` wraps native `<select>` elements and is consumed across forms, search, imports, groups, debts, categories, and profile preferences. `FilterBuilder.tsx` also contains a direct native select for AND/OR. Reports owns `MultiSelectFilter.tsx`, a custom searchable multi-select with checkbox options and select-all/clear controls; it is a visual reference, not an accessibility implementation template. Its listbox contains checkbox controls and current keyboard/focus behavior must be reviewed and improved, not copied unchanged. `CurrencySelect.tsx` owns currency loading and preference behavior. `ProfileHeader.tsx` currently contains an inline editable currency field, but this change must not edit that page component or its layout; its select appearance changes only through the shared `CurrencySelect` adapter. The web app uses React, TypeScript, Tailwind, lucide-react, and Testing Library/Vitest tests. The separate `refine-profile-identity-layout` work remains untouched.

## Goals / Non-Goals

**Goals:** Unify dropdown presentation and interaction affordances; retain each control's existing single/multi selection contract; support clear keyboard and assistive technology use; work in both themes and narrow viewports; add no dependency.

**Non-Goals:** Moving currency/date controls, changing profile header composition, changing filter logic or APIs, converting single-select fields to multi-select, or replacing unrelated date/text inputs and checkbox lists with dropdowns.

## Decisions

- Keep existing native single-select controls behind `SelectField`, with shared Tailwind trigger classes and a chevron. Keep the existing searchable single-value `CurrencySelect` as a combobox. Browser-owned native option popups and platform keyboard handling are exempt from pixel-identical menu styling and controlled open-state requirements.
- Build a small shared custom menu shell only for multi-select and searchable selection in the existing `components/` area. Define explicit single-value, multi-value, and searchable modes at the API boundary so a visual adapter cannot change a field's value cardinality. Reuse Tailwind tokens/patterns and lucide-react icons; do not add a component library dependency.
- Keep public field APIs controlled and semantically stable. Adapt `SelectField`, `CurrencySelect`, and Reports `MultiSelectFilter` to the shared presentation while preserving values, callbacks, allow-no-preference behavior, async currency loading, and labels.
- Audit all direct and wrapped selects, but leave inputs, date controls, and checkbox-based filter value editors as their current input types unless they are actual dropdown controls.
- Use established listbox/combobox semantics, explicit accessible names, visible focus, Escape handling, option navigation, and predictable focus return. Searchable controls announce no-result status. Single selection commits one option; multi-selection toggles without closing.
- Use the Reports trigger as a concrete style baseline: minimum height 40px (`min-h-10`), 12px horizontal padding (`px-3`), 8px vertical padding (`py-2`), 6px radius (`rounded-md`), 1px slate border, white/light or slate-950/dark surface, 14px text, and a 16px muted chevron. Focus uses a 2px mint/pine ring; disabled uses 60% opacity and not-allowed cursor. Custom menus use the matching border/surface, 8px trigger gap, shadow, 224px maximum option-list height (Reports' `max-h-56`), scroll, and viewport-constrained width. Selected options use a persistent check/checkbox state; hover uses slate-50/slate-800; no-results/empty copy uses muted slate text. Search keeps its 16px Search icon and named input. Preserve page layouts and constrain menus to available width at 375px and 1280px viewports.
- Validate with focused component tests for shared primitives/adapters and existing consumers; add keyboard/ARIA/theme/narrow viewport assertions. Per `docs/TESTING.md`, tests live beside the component under `tests/` and use Testing Library/user-event.

### Concrete migration inventory

- Shared primitive/adapters: `components/FormField.tsx` (`SelectField`); `components/CurrencySelect.tsx`; direct AND/OR select in `components/FilterBuilder.tsx`.
- Shared search/filter surfaces: only the selectable fields in `components/SearchBar.tsx` and `components/SearchComponent.tsx` may receive select presentation changes. Their search inputs, search behavior, and standalone/global/table search bars and ordinary text inputs are explicitly excluded and must remain functionally unchanged. `FilterBuilder.tsx` select fields and option-value controls remain in scope.
- Reports: `pages/Reports/components/MultiSelectFilter.tsx` and currency control in `ReportFiltersCard.tsx`; date inputs remain date inputs.
- Transactions: `pages/Transactions/TransactionEditPage.tsx`, `components/TransactionCoreFields.tsx`, `components/ImportedTransactionCard.tsx`, and `components/ImportedTransactionSelectionToolbar.tsx`; date inputs remain date inputs.
- Accounts: `pages/Accounts/components/AccountListItem.tsx` and `AddAccountCard.tsx` (currency controls included).
- Categories and groups: `pages/Categories/CategoriesPage.tsx`, `pages/Groups/components/GroupCategoriesSection.tsx`, and `GroupCategoryItem.tsx`.
- Debts and shared expenses: `pages/Debts/components/ApprovalActions.tsx`, `PersonDebtDetail.tsx`, and `pages/SharedExpenses/components/SharedExpenseFormCard.tsx`.
- Profile: the theme selector inherits `SelectField` styling and currency selection inherits `CurrencySelect` styling. No Profile-specific source edit is needed for dropdown standardization; header layout and currency relocation belong to `refine-profile-identity-layout`.

## Risks / Trade-offs

- [Custom listbox behavior may regress browser-native keyboard, mobile, or screen-reader behavior] → Keep all existing single-select controls native-backed, with browser-owned popup styling/open state exempt; custom semantics apply only to multi/search menus and receive focused keyboard/accessibility tests.
- [A generic wrapper could erase specialized placeholder or clear/no-preference behavior] → Preserve per-control API and write adapter regression cases for currency and select fields.
- [Menus may clip inside cards or dialogs] → Verify stacking/overflow in filter dialogs and responsive layouts; constrain menu dimensions to viewport and use existing layering conventions.
- [Profile work could overlap] → Limit Profile changes to the theme select and CurrencySelect appearance, with no header layout edits.

## Migration Plan

1. Implement shared styles/primitive and adapt the shared field and currency selectors.
2. Migrate direct select and Reports multi-select controls, then audit the listed consumers for exceptions.
3. Add/update focused tests for semantic preservation, keyboard operation, ARIA, theme, responsive sizing, and empty/disabled states; run those tests and relevant typecheck/lint checks.
4. Roll back by reverting the adapter/migration changes; no data or API migration is involved.
