# Design

## Context

The motivation is in proposal.md. The code as it stands:

- `PendingRequestsTab`, `SettledDebtsTab`, `BalancesTab` and `SharedExpensesListCard` already use `ListView`. None of them receives `isLoading` or `error`. `DebtsPage` prints its own loading and error lines under the tab panel.
- `AwaitingAcceptanceTab` is a hand-built `Card`. It has its own heading, its own alerts and `<article>` rows, and a second hand-built "Rejected" section.
- `PersonDebtDetailPage` renders a text "Back to balances" link above `PersonDebtDetail`, a bespoke summary card plus two `DebtTable`s. It has per-row settlement forms and a custom batch bar.
- `SharedExpensesPage` renders `SharedExpenseFormCard`, a legacy create/edit form toggled above the list by `useSharedExpenseForm` (234 lines). That form:
  - picks an existing transaction;
  - edits the title, status, participants, shares and *paid* amounts. The server ignores client paid amounts.
- The Transaction Form View's Sharing tab already does everything the legacy form does for participants and shares, with all the settlement guards. The only legacy-form field it does not cover is the shared-expense `status`, which only `PUT /shared-expenses/:id` can set.
- `GET /shared-expenses/:id` exists and lets the owner or any participant read. `PUT` is owner-only. `GET /transactions/:id` is owner-only.

## Goals / Non-Goals

**Goals:** reuse `FormView`, `ListView`, `RecordCard`, `RelatedList`, `EditableField` and `useFormDraft` as they are, delete the duplicated form, and keep every business flow intact.

**Non-Goals:**
- No restyle of Outstanding Balances or its tables.
- No change to the per-row settlement and approval forms.
- No backend or API change.
- No pagination: the debts endpoint returns everything, and these lists are client-side.
- No change to the "Settle all" fallback in Pending Requests.
- Notification deep links keep landing on the list highlight; they are not repointed to the new detail route.

## Decisions

1. **The shared Transaction Sharing tab manages participants, not a second editor.**
   - The Shared Expense Form View edits only what the transaction view cannot: title and status.
   - "Manage participants" and "Open transaction" link to `/transactions/:transactionId?tab=sharing`.
   - Alternative rejected: porting the participant editor into the new view, which would duplicate about 400 lines of guarded logic, or keeping the legacy form, which is exactly what the user rejected.
2. **"Add shared expense" opens the new-transaction draft with `shared=1`.** Creating a shared expense in FlowLedger means sharing a transaction, and the create path already sends the nested `sharedExpense` atomically.
   - Alternative rejected: a transaction picker in the Debts tab. Sharing an existing transaction already lives on that transaction's Sharing tab, and a picker would be a second entry point to maintain.
3. **`FormView` without a draft** gives the person balance detail the standard header and back arrow.
   - When `draft` is undefined: Save and Cancel hide, the Ctrl/Cmd+S handler is a no-op, and the back link never intercepts.
   - Alternatives rejected:
     - a fake always-clean draft object at the call site, which leaks a contract hack into a page;
     - extracting a new `BackLink` component, which adds a component when `FormView` already owns the header.
   - The detail's unsaved settlement drafts are row-level form state, not a record draft, so no dirty guard applies. This matches today's behaviour.
4. **Origin-aware back arrow through router `location.state.from`.**
   - `TransactionDetailPage` reads `state.from` only when it matches `^/(?!/)`, which blocks protocol-relative and open-redirect paths. Otherwise it falls back to `routes.transactions`.
   - The page re-passes the state when it navigates from `/transactions/new` to the stored record after create.
   - Alternative rejected: a `?from=` query param. It is visible, user-editable and would pollute the prefill whitelist.
5. **Awaiting Acceptance uses `ListView` `groups`.** It renders two labelled groups, and `ListView` already hides empty groups. Rows become `RecordCard`s with the shared highlight classes (`border-pine bg-mint`). The three response buttons stay in the card body and are not moved into the `actions` menu, so the primary consent actions stay one tap away, as today.
6. **Shared Expense rows become `Link`-wrapped `RecordCard`s, matching `BalancesTab`.** The Edit action goes, leaving no nested interactive controls.
7. **`useSharedExpenseForm` becomes a `useFormDraft` adapter.**
   - The draft is `{ title, status }`.
   - Validation requires a trimmed title.
   - Save sends `PUT /shared-expenses/:id` with only the changed keys, then invalidates `shared-expenses`, `debts`, `transactions` and `notifications`.
   - A non-owner gets `initial` and the fields are rendered `readOnly`. The draft never becomes dirty, matching how `GroupDetailPage` treats non-admins.
8. **Route `/debts/shared-expenses/:id`** sits under the Debts navigation, like `/debts/balances/:personKey`, so the sidebar keeps Debts active. The page lives in `pages/SharedExpenses/`, the module that owns the model.

## Simplicity review outcome

An independent simplicity review approved the plan with changes.

**Adopted:**
- The optional `draft` stays limited to `draft?.` guards inside `FormView`.
- `isDebtsTab` derives from the `debtsTabs` list.
- The highlight element ids (`debt-`, `settlement-`, `shared-expense-`, `shared-participant-`) are preserved.
- Awaiting rows link only their title, because the rows contain buttons.
- The `shared=1` draft must still block Save until it is valid.
- The duplicated query, category and workflow setup shared by `DebtsPage` and `PersonDebtDetailPage` is logged in `docs/KNOWN_ISSUES.md` rather than fixed here.

**Kept deliberately:**
- The Shared Expense record view: the product owner asked for a record view, and participants need a place to land.
- `location.state.from`: back navigation must return to the originating Debts view, and there is a one-line re-pass on create.

## Risks / Trade-offs

- [Creating from an existing transaction is no longer one click from Debts] → The subtitle and empty text of the Shared Expenses list say that an existing transaction is shared from its Sharing tab. The QA guide covers both paths.
- [Participants cannot open the transaction] → The actions are owner-only. Participants get the read-only view, which is everything the API lets them see.
- [Status is a manual field the server does not derive] → Behaviour is kept as is (owner-settable). It is out of scope to change.

## Migration Plan

This is a frontend-only deploy, with no data migration. Rollback is a redeploy of the previous web build.
