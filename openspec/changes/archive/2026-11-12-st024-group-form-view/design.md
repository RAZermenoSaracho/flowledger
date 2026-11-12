# Design

## Context

- `GroupsPage.tsx` holds `selectedGroupId` in state, reads `?groupId=`, and renders create card, list card and detail `Card` in an `xl` two-column grid. See proposal.md - Why.
- `GET /groups` returns members and categories (counts) per Group but no summary or transactions. `GET /groups/:id` adds recent transactions and the summary.
- Web `canManage` is "current user is a member with role `admin`". The API enforces the same (admin-only update, archive, restore, delete, add member, add category).
- ST-005 provides `useFormDraft`, `FormView` and `EditableField` (see `st005-reusable-editable-form-view`). They are consumed here and not re-specified.

## Goals / Non-Goals

**Goals:** card overview, linkable detail on the shared Form View, working legacy links, #028 closed, behavior otherwise unchanged.

**Non-Goals:**
- A per-card summary (needs N detail calls or a new endpoint; the roadmap leaves this open).
- Server changes, including #020's 400-for-non-member response and #015/#018.
- Route-level blocking of in-app links (ST-005's unsaved-change rule applies unchanged).
- A remove-member UI (none exists today).

## Decisions

- **Routes:** `/groups` (overview) and `/groups/:id` (detail). Alternative: keep one page with a mode switch. Rejected: no linkable URL and no browser-back behavior.
- **Cards use list data only.** Alternative: a summary per card. Rejected: N+1 calls or a new endpoint for a roadmap open question.
- **Archived default filter:** the overview's existing search state starts with an `isArchived = false` chip, so archived Groups are hidden but one removal shows them. The field already exists in `groupSearchFields.ts`. No `search-filter-chips` change is needed, because it only defines chip removal.
- **Detail data:** the detail view uses the existing `GET /groups/:id` query. Non-member, unknown or malformed ids (400 or 404) render one not-found state with a link back to the overview. Alternative: find the Group in the list. Rejected: the detail needs summary and transactions anyway.
- **Draft:** `useFormDraft` with `name` and `description`. `useGroupManagement` keeps only the immediate actions (archive, restore, delete, add member) and its edit state is removed. Save calls the existing `PUT /groups/:id`. `validate` wraps the shared update schema.
- **Edit gating:** `EditableField` is `readOnly` unless the user is a Group admin and the Group is not archived (the same rule as today's `canManageActive`). Server authorization is unchanged.
- **Related lists:** members and categories render as `RelatedList` in immediate mode (each add/remove/edit is its own request, never `update(fn)` on the draft). Members' `cell` renders the public label from ST-003's serialization (`@username` or `Name (@username)`); the web never falls back to email. Member-add uses ST-003's username search (min 3 chars, prefix match). No server work here: ST-003 owns serialization, search and the non-member participant rule.
- **No widened access:** ST-024 adds no endpoint or field; a non-member shared-expense participant (ST-003 universal sharing) still gets only the shared expense and transaction summary, never Group data.
- **Direct editing:** `EditableField`s are always live controls (no Edit button) and Save/Discard are ST-005's compact header actions; no bottom bar.
- **Rebase protection:** member and category mutations refetch the Group. ST-005's rebase rule keeps a dirty draft intact.
- **Navigation:** Back and the FormView Discard/Back confirm follow ST-005's rule. Delete and archive navigate to `/groups` after success. Create stays on the overview, then navigates to `/groups/:newId`.
- **Legacy links:** `/groups?groupId=X` renders `<Navigate replace to="/groups/X">`, so browser back is not trapped. `notificationTarget.ts` emits `/groups/X`.
- **#028 fix:** remove `xl:sticky` and the two-column grid. Both views are single-column flow, so the `FilterBuilder` modal (`fixed inset-0 z-50`) is no longer inside a stacking context. If the browser check still shows clipping, portal the modal to `document.body`. Alternative: always portal. Deferred: unneeded if the browser check passes.
- **Docs:** `DOMAIN_LOGIC.md` "only the owner" becomes "Group admins (members with role `admin`)".

## Risks / Trade-offs

- Notification links still using `?groupId=` (stored metadata or old clients) → covered by the redirect.
- Archived Groups hidden by default may look like missing Groups → the chip is visible and removable.
- A refetch after an immediate action while editing → rebase rule, covered by a hook-level test.

## Migration Plan

Web-only. No data or API change. Rollback is reverting the PR.
