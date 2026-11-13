# Proposal

## Why

The Debts module is the last area that does not follow FlowLedger's list and record patterns. The Outstanding Balances detail has a plain "Back to balances" text link instead of the Form View back arrow. Shared Expenses still edits records in a legacy form card that opens above the list. Awaiting Acceptance is a hand-rolled card instead of the shared `ListView`. The tabs also drop the shared loading and error states. The aim is consistency and less code, not a visual redesign.

## What Changes

- **Outstanding Balances detail** (`/debts/balances/:personKey`) renders through the shared `FormView` header. It gets the standard icon-only back arrow to `/debts?tab=balances`, and the person's name becomes the title. The summary card, the debt tables, the per-row settlement forms and batch settlement keep their current look and behaviour.
- **`FormView` without a draft.** `draft` becomes optional, so a record view with nothing editable at the record level gets the same header, back arrow, tabs and actions menu. Without a draft there is no Save or Cancel and no dirty guard. This adds no new component.
- **Shared Expense Form View** at `/debts/shared-expenses/:id` (new route) replaces the inline legacy form.
  - **General tab:** title and status, editable by the owner through the existing `PUT /shared-expenses/:id`, plus a read-only transaction summary and direction label.
  - **Participants tab:** `RelatedList` of shares, showing paid amount, participant status and acceptance.
  - **Owner record actions:** "Manage participants" and "Open transaction" open the existing Transaction Form View's Sharing tab, which already owns participant management. The back arrow returns to the shared expense.
  - **Participants** see the same view read-only.
  - **Back arrow:** returns to `/debts?tab=sharedExpenses`.
- **Shared Expenses list** rows open the Form View, as Outstanding Balances rows do. The "Edit" row action and the form card above the list are removed. "Add shared expense" opens `/transactions/new?shared=1&tab=sharing`, the standard Transaction create Form View with sharing turned on. An existing transaction is shared from its own Sharing tab, as today.
- **Transaction Form View:**
  - The `shared=1` prefill parameter turns sharing on.
  - The back arrow honours an in-app origin passed in router state, so a view opened from Debts returns to Debts. Without one it falls back to `/transactions`, as now.
- **Awaiting Acceptance** uses `ListView`, with labelled groups for "Awaiting your response" and "Rejected" and `RecordCard` rows. The Accept, Reject and Reject-and-block actions are unchanged. Row titles link to the Shared Expense Form View.
- **Loading and error states.** Every Debts tab passes `isLoading` and `error` to its `ListView`. The page-level "Loading debts..." and "Could not load debts." lines are removed.
- **Removed:**
  - `SharedExpenseFormCard`
  - the legacy `useSharedExpenseForm`, which becomes a small `useFormDraft` adapter for title and status
  - `createSharedExpense` in the web client, which no longer has callers
  - the obsolete page-local participant draft type
- **Debt table selection** passes the visible row ids to `toggle`, as `ListView` does, so range selection works the same way.

- **`FormView` becomes a component directory**, following `ListView/` and `SearchBar/`: `components/FormView/FormView.tsx`, a private `FormViewHeader.tsx`, an `index.ts`, and the tests in `FormView/tests/`. The public API and behaviour are unchanged, and consumers keep importing `components/FormView`.

No backend, schema or API changes. Debt calculations, settlement requests, approvals, consent and permissions are untouched.

## Capabilities

### New Capabilities
- `debts-views`: navigation, list and record-view behaviour of the Debts tabs, the person balance detail and the Shared Expense Form View.

### Modified Capabilities
- `editable-form-view`: `FormView` accepts no draft for non-editable record views.
- `web-component-organization`: `FormView/` is added as a cohesive component directory.
- `transaction-form-view`: a `shared` prefill parameter and an origin-aware back arrow.

## Impact

- `apps/web` only. The work touches the following areas:
  - `pages/Debts/`: `DebtsPage`, `PersonDebtDetailPage`, `PersonDebtDetail`, `DebtTable`, `AwaitingAcceptanceTab`, and the tabs' loading and error props.
  - `pages/SharedExpenses/`: a new `SharedExpenseDetailPage`, a rewritten `useSharedExpenseForm`, and the list item and list card. `SharedExpenseFormCard` is deleted.
  - `pages/Transactions/`: prefill and the back target.
  - `components/FormView/FormView.tsx`
  - `services/sharedExpenses.client.ts`: add `getSharedExpense`, drop `createSharedExpense`.
  - `constants/routes.ts`, `main.tsx`
- Tests are updated alongside each changed file.
- The notification deep links (`?tab=sharedExpenses&sharedExpenseId=`, `?tab=awaiting&sharedExpenseId=`) keep working through the list highlight.
