# Tasks

Prerequisites: ST-005 (`st005-reusable-editable-form-view`) and ST-003 (`st003-convert-transaction-to-shared`: public identity serialization, username search, non-member participant rule) are implemented; this change adds no server work. Every new or changed `controllers/`, `services/`, `utils/`, `hooks/` and `components/` file gets a matching `tests/` file (docs/TESTING.md), and every export gets TSDoc.

## 1. Routes and legacy links

- [x] 1.1 Add `/groups/:id` to `constants/routes.ts` and `main.tsx` (additive, after ST-006 and ST-007 edits). Verify: `main`/routes test or `GroupDetailPage.test.tsx` renders the detail at `/groups/:id`.
- [x] 1.2 Redirect `/groups?groupId=X` to `/groups/X` with `<Navigate replace>`, and change `layout/utils/notificationTarget.ts` to emit `/groups/X`. Verify: update `layout/utils/tests/notificationTarget.test.ts` and `GroupsPage.test.tsx` (redirect case replaces the old `?groupId=` selection test).

## 2. Overview

- [x] 2.1 Rebuild `GroupsPage.tsx` as a card overview: one new card component for name, description, member/category counts, role, and Archived badge, clicking navigates to `/groups/:id`; drop `selectedGroupId` and the two-column grid. Verify: `components/tests` for the card, and `GroupsPage.test.tsx` covers click-through and no detail beside the list.
- [x] 2.2 Start the overview with a removable `isArchived = false` chip in the existing search state. Verify: `GroupsPage.test.tsx` hides an archived Group by default and shows it after chip removal.
- [x] 2.3 Keep inline create on the overview and navigate to the new Group's detail on success. Verify: `GroupCreateCard` test plus a page test asserting navigation.

## 3. Detail view

- [x] 3.1 Add `GroupDetailPage.tsx`: loads `GET /groups/:id`, shows a not-found state (with link to overview) for non-member, unknown or malformed ids, and a back control to `/groups`. Verify: `GroupDetailPage.test.tsx` covers member, non-member and unknown id.
- [x] 3.2 Replace the hand-written edit state in `useGroupManagement.ts` with a `useFormDraft` adapter for `name` and `description` (required name, shared update schema, existing `PUT /groups/:id`), rendered in `FormView` with `EditableField`, read-only unless admin and not archived. Keep archive, restore, delete and add-member as immediate actions that return to `/groups` after archive and delete. Verify: `hooks/tests/useGroupManagement.test.ts` covers validation, save, read-only for non-admin and archived, and a dirty draft surviving a member-add refetch.
- [x] 3.3 Rebuild `GroupMembersSection` and `GroupCategoriesSection` on ST-005 `RelatedList` in immediate mode (mutations do not touch the draft); members render the public label from ST-003's serialization (no email) and member-add uses ST-003's username search. Mount them with `GroupSummarySection` and `GroupTransactionsSection` as `FormView` children, unchanged in behavior. Update `GroupHeader.tsx` accordingly. Verify: section tests updated for `RelatedList` (public labels, no email, username search, mobile stacked rows); a dirty draft survives a row mutation; `GroupDetailPage.test.tsx` asserts they render.

## 4. Layout and docs

- [x] 4.1 Remove `xl:sticky` and the two-column layout. Verify (browser): with the dev server, open the filter modal and a dropdown on the overview and detail view at 375px and 1440px; record that each sits above all content, nothing is clipped or overlapped. If not, portal the `FilterBuilder` modal to `document.body` and re-check.
- [x] 4.2 Fix `docs/DOMAIN_LOGIC.md` "only the owner" to Group admins (role `admin`). Verify: grep finds no "only the owner" in the group section.
- [x] 4.3 Mark `docs/KNOWN_ISSUES.md` #028 resolved. Leave #015, #018 and #020 unchanged. Verify: diff touches only #028.

- [x] 4.x Move Archive/Restore/Delete from `GroupHeader` into `FormView` `actions` for admins only, and use `backLink` "Back to groups". Verify: `GroupDetailPage.test.tsx` covers the menu (admin) and no menu (member); `GroupHeader.test.tsx` no longer renders actions.


## 5. Final verification

- [x] 5.1 Web `npm run typecheck`, `npm run lint` and `npm run test` pass; new files have TSDoc and matching tests; no Group-specific form lifecycle remains.
- [x] 5.2 Browser walkthrough as an admin, a non-admin member and a non-member: overview, open, back (control and browser), edit and save, create, archive, legacy `?groupId=` link. Verify: non-member sees not-found, non-admin sees read-only fields, a non-member shared-expense participant gets not-found, fields are directly editable with compact header Save/Discard at 375px and desktop.
- [x] 5.3 `openspec validate st024-group-form-view --strict` passes.

## 6. Tabs

- [x] 6.1 Split `GroupDetailPage` into `FormView` `tabs`: General (header fields, summary, transactions), Members, Categories. Verify: `GroupDetailPage.test.tsx` covers tab navigation, member add across tabs keeping the draft, and non-admin permissions.
