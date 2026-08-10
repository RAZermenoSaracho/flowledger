# Domain Logic

---

## Groups

Groups are the multi-user collaboration unit in FlowLedger. They replace the old "Household" concept — never introduce that term.

- A Group has one owner (`ownerUserId`) and any number of members (`GroupMember`).
- Groups own categories (`Category.groupId`). Group members can use these categories.
- Transactions can be scoped to a group (`Transaction.groupId`). Group transactions appear in group reports.
- Groups can be archived (soft delete).
- Group admin: only the owner can update or archive the group, add/remove members.

### Membership rules
- Only group members can access group categories or create group-scoped transactions.
- The `getGroupMembership()` helper in `groups/services/read.service.ts` enforces this in transaction and category operations.

---

## Categories

Two scopes:

1. **Personal categories** — `groupId = null`. Accessible to one user via `CategoryUser` join.
2. **Group categories** — `groupId` set. Accessible to all group members.

Categories have a `type` (`income` or `expense`). This type is enforced when assigning categories to transactions and imported transactions.

### Expense offset categories

An income transaction can have an `expenseOffsetCategoryId`. This is used for settlement income transactions — the creditor receives money that "offsets" an expense in a specific category (e.g., "Received rent payment → offset Housing expense").

In reports, expense offset amounts are subtracted from the expense category's net total and from the income category's net total, preventing double-counting of settlement flows.

---

## Transactions

| Type | Accounts | Category |
|---|---|---|
| `income` | `accountId` optional | Required (unless group transaction) |
| `expense` | `accountId` optional | Required (unless group transaction) |
| `transfer` | Both `accountId` AND `transferToAccountId` required | None allowed |

Transfers: cannot have categories, groups, or shared expenses. Source and destination accounts must differ.

### Account balance calculation

`calculateAccountBalance(accountId, transactions, initialBalance?)` in `transactionCalculations.ts`:

- income with `accountId = accountId` → +amount
- expense with `accountId = accountId` → -amount
- transfer with `accountId = accountId` (source) → -amount
- transfer with `transferToAccountId = accountId` (destination) → +amount

Balance = `initialBalance + (sum of above)`

### Transaction relationships

`TransactionRelation` links two transactions. Currently used only for `settlement_payment` — pairs the debtor and creditor settlement transactions. These links make settlement transactions queryable as a group and filter them from the "normal" transaction view.

---

## Shared Expenses

A `SharedExpense` is created on an existing expense or income `Transaction`.

- `ownerUserId` is the user who paid (expense) or who is owed (income).
- `totalAmount` mirrors the transaction amount.
- `status`: `open` → `settled` (all participants paid) or `cancelled`.

### Participants

`SharedExpenseParticipant` — each participant has:
- `userId` (optional — can be a named non-registered person)
- `participantName` — display name
- `shareAmount` — what they owe
- `paidAmount` — what they've paid (incremented as settlements are approved)
- `status` — `pending` / `partial` / `paid`

Sum of `shareAmount` across all participants should equal the transaction amount.

### Debt direction logic

Located: `apps/api/src/modules/debts/debtDirection.ts`

Debt direction depends on the transaction type:

| Transaction type | Debtor | Creditor |
|---|---|---|
| `expense` | Participant (`userId`) | Expense owner (`ownerUserId`) |
| `income` | Income owner (`ownerUserId`) | Participant (`userId`) |

For income shared expenses (e.g., rent collected): the owner is owed by participants. For expense shared expenses (e.g., dinner split): the owner paid and participants owe them.

Manual participants (`userId = null`) have `debtorUserId` or `creditorUserId` set to `null` — they are external and cannot participate in digital settlements.

`isDebtRelevantToUser(debt, userId)` — returns true if the user is the owner or participant.

---

## Debts

The debt view (`GET /debts`) returns:

- **iOwe** — participations where `debtorUserId = userId` AND `outstandingAmount > 0`
- **owedToMe** — participations where `creditorUserId = userId` AND `outstandingAmount > 0`
- **pendingSettlementRequests** — `SettlementRequest` where `status = "pending"` AND user is debtor or creditor
- **approvedSettlementRequests** — approved requests where debtor is the current user (awaiting transaction registration)
- **settledDebts** — participations with `outstandingAmount = 0`

`outstandingAmount = shareAmount - paidAmount`

`pendingSettlementAmount` = sum of pending settlement requests for a debt (cannot submit a new request that exceeds `outstanding - pending`).

---

## Settlement workflow

### Settlement request (debtor-initiated)

1. Debtor calls `POST /debts/:participantId/settlement-request`
2. Body: `{ amount, accountId, categoryId, note?, paymentInfo? }`
   - `accountId` — debtor's payment account (expense transaction will be created here)
   - `categoryId` — debtor's expense category for the settlement
3. Validates: outstanding balance > 0, amount ≤ outstanding - pending, no duplicate pending request
4. Creates `SettlementRequest` with status `pending`
5. Notifies creditor: `settlement_requested` notification

### Settlement approval (creditor)

`POST /settlements/:requestId/approve`

Body: `{ accountId, categoryId, expenseOffsetCategoryId? }`
- `accountId` — creditor's income account
- `categoryId` — creditor's income category
- `expenseOffsetCategoryId` — optional; if the original transaction was an expense, this links the income to offset that expense category

1. Verifies direction still matches (outstanding hasn't shifted)
2. Verifies amount still fits outstanding balance
3. Updates `SharedExpenseParticipant.paidAmount += amount`, recalculates `status`
4. Marks `SettlementRequest.status = "approved"`
5. Creates debtor transaction: `type = "expense"`, amount, date = now, account/category from request
6. Creates creditor transaction: `type = "income"`, amount, date = now, account/category from approval, `expenseOffsetCategoryId` if applicable
7. Creates `TransactionRelation` pairs between debtor and creditor transactions
8. Links both transactions to the `SettlementRequest`
9. Notifies debtor: `settlement_approved` notification with transaction IDs
10. If all participants are paid: marks `SharedExpense.status = "settled"`

### Rejection (creditor)

`POST /settlements/:requestId/reject`

1. Marks `SettlementRequest.status = "rejected"`
2. Notifies debtor: `settlement_rejected` notification

### Direct settlement (creditor)

`POST /debts/:participantId/settle`

Creditor manually marks the full debt as paid immediately (no settlement request flow). Updates `paidAmount` to full `shareAmount`, marks status `paid`. Cancels any pending settlement requests for this participant.

---

## Reports

Located: `apps/api/src/modules/reports/reports.routes.ts` and `transactionCalculations.ts`

### Summary

- `totalGrossIncome` — sum of all income transactions
- `totalNetIncome` — sum of income excluding expense-offset income (`expenseOffsetCategoryId = null`)
- `totalGrossExpenses` — sum of all expense transactions
- `totalExpenseReimbursements` — sum of income transactions that have `expenseOffsetCategoryId`
- `totalNetExpenses` = `totalGrossExpenses - totalExpenseReimbursements`
- `currentBalance` = `totalGrossIncome - totalGrossExpenses`

Transfers are excluded from all summary calculations.

### Category report

Groups transactions by `(categoryId, type)`. Separately aggregates:
- Expense reimbursements per expense category (from income transactions with `expenseOffsetCategoryId`)
- Income offset amounts per income category (from income transactions with `expenseOffsetCategoryId`)

Net expense = gross expense - reimbursements. Net income = gross income - income offsets.

### Monthly cashflow

`calculateMonthlyCashflow(transactions, options?)` in `transactionCalculations.ts`:

Groups by `YYYY-MM`. For each month:
- `grossIncome` — sum of income
- `incomeOffsets` — income with `expenseOffsetCategoryId`
- `netIncome` = `grossIncome - incomeOffsets`
- `grossExpenses` — sum of expenses
- `expenseReimbursements` — income with matching `expenseOffsetCategoryId` (filtered by `options.categoryIds`)
- `netExpenses` = `grossExpenses - expenseReimbursements`
- `income` = `grossIncome` (alias)
- `expenses` = `grossExpenses` (alias)
- `balance` = `grossIncome - grossExpenses`

Transfers are excluded from cashflow. Category filters apply to both `categoryId` and `expenseOffsetCategoryId`.

---

## Notifications

Notifications are created by service functions (`notifications.service.ts`) whenever significant domain events occur:

| Event | Type | Who receives |
|---|---|---|
| Group member added | `group_member_added` | New member |
| Shared expense created | `shared_expense_added` | All participants |
| Debt created | `debt_owes_money` / `debt_owed_money` | Debtor / Creditor |
| Settlement requested | `settlement_requested` | Creditor |
| Settlement approved | `settlement_approved` | Debtor |
| Settlement rejected | `settlement_rejected` | Debtor |
| Settlement payment needed | `settlement_payment_registration_needed` | Debtor |
| Provider transactions pending | `provider_transactions_pending` | Transaction owner |

The `provider_transactions_pending` notification is upserted (one per user, updated with current count). It is automatically marked read when all pending imported transactions are resolved.

Navigation targets for notifications are computed in `AppLayout.tsx` → `notificationTarget()`.
