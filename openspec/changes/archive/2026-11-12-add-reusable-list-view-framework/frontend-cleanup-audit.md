# Frontend dead-code audit (apps/web)

Date: 2026-11-12. Read-only audit of `apps/web` (src/, public/, index.html, vite config). Separate from the ListView change scope; nothing was modified.

Method: Codex inventory (delegated, returned later; it agrees with the figures below, plus one extra dead type export `CrossCurrencyRecord` in `pages/Transactions/utils/crossCurrencyRecord.ts`) was cross-checked against my own node import-graph script (relative imports incl. extensionless/.js/index, static + dynamic import, non-test importers) plus manual checks of main.tsx routes (no `React.lazy`; all routes are static imports), polyfills, CSS imports, tailwind.config.ts, manifest, index.html and name-grep for string refs.

Counts: A files 2 | B files 0 | C 5 | dead exports 49 (names only; many are just types or single-file helpers that need no `export`)

## A. Confirmed unused
| Path | Reason | Evidence |
|---|---|---|
| `public/logo.svg` | Not referenced anywhere | grep for `logo.svg` across web app (excl. node_modules/dist/coverage) returns nothing; not in index.html, manifest, CSS or src |
| `src/utils/search.ts` (`matchesSearch`) | Zero non-test importers; superseded by `searchDomain.ts` (domain filter) | only `utils/tests/search.test.ts` imports it. Delete file and its test together |

Not unused (checked): `types/syncfy.types.ts` is an ambient `declare module` for the dynamic import in `pages/Accounts/utils/syncfyWidget.ts`. `constants/darkPalette.ts` is imported by `tailwind.config.ts` (and a test). Keep both.

## B. Likely redundant
None confirmed. Overlap candidates are listed in C.

## C. Requires investigation
1. `components/SearchBar.tsx` (420 lines) vs `components/FilterBuilder.tsx` (521) vs `SearchComponent.tsx`: three search/filter UIs. SearchBar is live (Card, PageHeader, AddRecordButton, RelatedTransactionsList); confirm responsibility split after ListView lands.
2. `components/RelatedList.tsx` vs `RelatedTransactionsList.tsx`: near-equal size (100/96 lines), overlapping role.
3. `components/RecordCard.tsx` vs `CategoryCard.tsx` vs `Card.tsx`: CategoryCard is a single-purpose card used by Categories/Groups pages; check whether RecordCard covers it.
4. `components/CopyButton.tsx` and `GoogleIcon.tsx`: each has exactly one consumer (ConnectClientSection, GoogleOAuthButton); fine, but candidates for inlining if fragmentation is a concern.
5. `public/apple-touch-icon-240x240.png`, `icon-maskable-512.png`: referenced (index.html/manifest) so used; only noting the icon set is guarded by `src/tests/appIcons*.test.ts`.

## Dead exports in live files
Not imported by any other non-test file (T = also used by tests; "unexport" is the fix, not deletion, where used locally):
- Fully unused client functions (verified no caller in src): `services/accounts.client.ts` listProviderInstitutions, getProviderConnectionStatus, resyncProviderConnection, resyncProviderAccount; `auth.client.ts` getMe, clearToken (used internally); `debts.client.ts` settleDebtDirectly; `groups.client.ts` removeGroupMember; `transactions.client.ts` getTransactionsSummary. Check whether the API endpoints they wrap are still used before deleting.
- `utils/money.ts` formatUnits; toUnits, fromUnits (T). `utils/dateTime.ts` localDayStartInstant (T).
- `utils/searchDomain.ts` DEFAULT_OPERATORS_BY_TYPE, isValueComplete (T), countConditions (T), conditionValueText (T) plus types FieldType, FieldOption, WhereCondition, DomainNode.
- `pages/Transactions/utils/transactionSave.ts` buildSharedExpenseUpdate, draftFieldForServerField; buildCreateBody, buildUpdateBody, TransactionSaveError (T).
- `pages/Debts/utils/debtDisplay.ts` partyName, transactionTypeLabel (T); `debtSearchFields.ts` three *SearchRow types.
- `pages/Groups/utils/groupSearchFields.ts` GROUP_GROUPABLE_FIELDS (T); `pages/Accounts/components/AccountTypeSections.tsx` ACCOUNT_TYPE_SECTIONS (T); `SharedExpenseListItem.tsx` splitDirectionLabel (T); `ImportedTransactionCard.tsx` importedTransactionType (T); `ReportFiltersCard.tsx` reportAmountModes; `services/api.client.ts` refreshAccessToken (T).
- Unreferenced exported types: Query/Params types in services/*.client.ts, ApiKeyScope, OAuthScope, RelatedListColumn, CategoryReportRow, SharedExpenseTransaction, SettlementOrigin, ProviderImportedTransactionStatus, AccountTypeSectionProps, ProfileDraftField, ShareResponse, UnavailableActionProps, SharedExpenseParticipantInput.

## Handled by ListView change (not counted)
- `components/SearchComponent.tsx` (component dead; `groupByFields` export used; its Search* types are the unreferenced exports there).
- `pages/Debts/components/EmptyState.tsx`.

## Recommendation
A is tiny (one orphan SVG, one superseded util plus its test), so a dedicated change is only worth it bundled: after ListView merges, do one small maintenance change that deletes A, removes the unused client functions (after confirming API endpoints are not needed), drops needless `export` keywords, and re-evaluates C items 1 to 3 once SearchComponent/SearchBar/FilterBuilder responsibilities settle.
