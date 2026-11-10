# Tasks

## 1. Shared types and hook

- [ ] 1.1 Add the named types (hook options and result, `FormViewTab`, field props) to `apps/web/src/types/common.types.ts`, each with TSDoc. Verify: `npm run typecheck -w apps/web` passes.
- [ ] 1.2 Add `apps/web/src/hooks/useFormDraft.ts` implementing the `editable-form-view` contract: draft, `update`, dirty keys with structural equality, validation gate, batch save, rebase-only-when-clean, field-named error mapping. Add TSDoc on the hook and its return. Verify: `hooks/tests/useFormDraft.test.tsx` covers a non-Profile consumer, dirty and revert-by-retyping, nested values, invalid save blocked, save success and failure, field-named errors, the double-save guard, and rebase when clean versus dirty.
- [ ] 1.3 Register the `beforeunload` guard in the hook while dirty. Verify: the same test file asserts the listener exists only while dirty.

## 2. Shared components

- [ ] 2.1 Move Profile's `ModalDialog` to `apps/web/src/components/` with its test, and update imports. Verify: its moved test and the Profile tests pass.
- [ ] 2.2 Add `components/EditableField.tsx` from `ProfileInlineField` (always-rendered control, quiet rest style, hover/focus ring, dirty marker, `readOnly` plain-text variant, `label`, `hideLabel`, `error`, `onRevert`, `text-base sm:text-sm`, 40px targets). Verify: `components/tests/EditableField.test.tsx` covers control present with no click, Escape revert of only that field, blur keeping the draft, dirty marker, read-only plain text, error `role="alert"` with `aria-describedby`, and textarea, select and custom-control children.
- [ ] 2.3 Add `components/FormView.tsx` header with always-visible compact Save and Discard (disabled when clean with a reason, busy while saving, disabled on validation errors, at least 40px, not full-width, header-row layout on mobile), inline `saveError`, Ctrl/Cmd+S, `onSave`, and confirm on Discard and Back when dirty. Verify: `components/tests/FormView.test.tsx` covers clean, dirty, busy and invalid button states with reasons, no bottom bar, size and width classes, shortcut (dirty versus clean, default prevented), inline error, `onSave`, confirm flow, and a children section not touching the draft.
- [ ] 2.3a Add generic tabs to `FormView` (`{ id, label, badge?, content }[]`, URL-driven, generalized from `ProfileTabs`). Verify: the `FormView` test covers tablist semantics, badge, and draft retention across a tab switch with no prompt.
- [ ] 2.3b Add `components/RelatedList.tsx` per the `Related list` requirement (table at `sm`+, stacked below, render-prop cells, loading/empty/error block, add and remove callbacks, `canRemove`, footer). Verify: `components/tests/RelatedList.test.tsx` covers both layouts, the three states, add and remove callbacks and `canRemove`, an `EditableField` cell with Escape reverting only that cell, a `tempId` row key, a dotted-path row error shown by the caller, and the footer.
- [ ] 2.4 Confirm the shared files import nothing from `pages/` and name no model. Verify: `grep -rniE "profile|account|transaction|group|pages/" apps/web/src/hooks/useFormDraft.ts apps/web/src/components/FormView.tsx apps/web/src/components/EditableField.tsx apps/web/src/components/RelatedList.tsx` finds no model references.

## 3. Profile migration

- [ ] 3.1 Rewrite `useProfileDetails` as a Profile adapter over `useFormDraft` (Profile `initial` and `validate`, `save` as email, profile, avatar; avatar `File` as a draft field; password prompt wired through `onSave`). Remove the hook's own draft, dirty, guard and error state. Verify: `useProfileDetails.test.tsx` keeps its scenarios, updated only where the returned shape changed.
- [ ] 3.2 Move `ProfilePage`, `ProfileHeader` and the General tab onto `FormView` and `EditableField`, and delete `ProfileInlineField.tsx` and `ProfileTabs.tsx` with their tests (their coverage now lives in the shared tests). Keep `GeneralTab`'s children area for ST-008. Rewrite the click-to-activate selectors in their tests to type into the always-rendered inputs and use header Save/Discard, keeping every scenario. Verify: `ProfilePage.test.tsx`, `ProfileHeader.test.tsx` and `GeneralTab.test.tsx` pass, covering tab-switch draft retention and avatar upload on Save.
- [ ] 3.3 Add a `GeneralTab` test that a child rendered into the children area appears below the details. Verify: the test passes.

## 4. Docs

- [ ] 4.1 Add a `docs/KNOWN_ISSUES.md` entry that in-app route-level unsaved-change blocking is deferred (needs a data router; `main.tsx` uses `BrowserRouter`). Verify: the entry follows the file's format with a suggested fix.
- [ ] 4.2 Note the shared Form View in `apps/web/CLAUDE.md` (file locations, the no-edit-mode and header-actions rules, and the adoption rule). Verify: the section names the four files and the rule.

## 5. Verification

- [ ] 5.1 `npm run typecheck`, `npm run lint` and `npm run test -w apps/web` pass. Verify: all green.
- [ ] 5.2 Manual check of Profile in a browser at 375 and 1280 CSS pixels in both themes. Verify: direct editing with no Edit button, Escape on one field, header Save/Discard states and Ctrl/Cmd+S, save and discard, avatar, email prompt, tab switch with an unsaved draft, and no iOS-size zoom (inputs at least 16px on mobile).
