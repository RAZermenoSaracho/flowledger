# Proposal

## Why

`/groups` shows the Group list and the selected Group's detail side by side. The list column is `xl:sticky`, which creates a stacking context: the filter modal opens partly behind the detail form (KNOWN_ISSUES #028). Group editing also uses a hand-written draft in `useGroupManagement` instead of the shared Form View, and a Group has no linkable URL.

## What Changes

- `/groups` becomes a responsive card overview built only from the existing `GET /groups` data: name, description, member and category counts, the user's role, and an Archived badge. Archived Groups are hidden by a visible, removable default filter.
- New `/groups/:id` is the Group detail view, composed from ST-005's `FormView`, `EditableField` and `useFormDraft` (change `st005-reusable-editable-form-view`). Draft fields are `name` and `description` only.
- Clicking a card navigates to the detail view, which has a back-to-overview control. Browser back does the same. The two views are never shown side by side.
- `/groups?groupId=X` redirects to `/groups/X`, and `notificationTarget.ts` emits the new URL.
- Members and categories become ST-005 `RelatedList` sections in immediate mode; they, archive, restore and delete never dirty the draft. Members show public identities (`@username` or `Name (@username)`, never email) and the member-add search is username search; both rely on `st003-convert-transaction-to-shared` (public identity serialization and username search), which lands earlier in the PR. ST-024 does not widen access: Group data is never exposed to non-member shared-expense participants. Archive and delete return to the overview. Create stays on the overview, then opens the new Group.
- The sticky side-by-side layout is removed, which resolves #028. Layering is verified in a browser.
- `docs/DOMAIN_LOGIC.md` is corrected: Group admins (role `admin`), not "only the owner", manage a Group.
- No API endpoint, schema, migration, dependency or server authorization change.

## Capabilities

### New Capabilities
- `group-overview`: Group card overview, linkable detail view on the shared Form View, and legacy link compatibility.

### Modified Capabilities

None. `search-filter-chips` is unchanged: the default archived filter is an ordinary removable chip, which that capability's removal rules already cover.

## Impact

- `apps/web`: `pages/Groups/*`, `main.tsx`, `constants/routes.ts`, `layout/utils/notificationTarget.ts`, and their tests.
- `docs/DOMAIN_LOGIC.md`, `docs/KNOWN_ISSUES.md` (#028 only).
- Out of scope and still logged: #015 (last admin removable), #018 (delete orphans transaction `groupId`), #020 (`GET /groups/:id` returns 400 for non-members; the web shows not-found regardless).
- Dependency: ST-005 must land first. Ships in the single B-004 PR to `razs_ai`, fifth in order (after ST-003, which supplies public identities, before ST-008). Shared files (`main.tsx`, routes) are edited additively after ST-006 and ST-007.
