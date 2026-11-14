# Spec Delta

## Purpose
Defines credit cards as credit liabilities on the existing ledger: their configuration, the derived debt, available credit and utilization, how each existing transaction type behaves on a card, and the minimal classification that separates payments and interest from other card entries.

## ADDED Requirements

### Requirement: Credit-card configuration fields

An account SHALL have these optional fields:
- `creditLimit`: a positive decimal in the account currency;
- `statementClosingDay`: an integer from 1 to 31;
- `paymentDueRule`: `day_of_next_month` or `days_after_closing`;
- `paymentDueValue`: an integer;
- `billingTimeZone`: a valid IANA zone;
- `annualInterestRate`: a decimal percentage from 0 to 1000.

The fields SHALL be accepted only on `credit_card` accounts, on the web API, `/v1` and MCP, at create and update time. On any other type they SHALL be rejected with 400 naming the field.

`statementClosingDay`, `paymentDueRule`, `paymentDueValue` and `billingTimeZone` SHALL be given together or not at all. A card without them has no billing periods.

The due date SHALL never fall after the next closing date. The system SHALL enforce this as follows:
- `day_of_next_month` requires `paymentDueValue` from 1 to `statementClosingDay`;
- `days_after_closing` requires `paymentDueValue` from 1 to 28.

Changing the type away from `credit_card` SHALL clear all six fields.

#### Scenario: Configure a card
- **WHEN** the owner updates a `credit_card` account with these values:
  - limit 30000;
  - closing day 20;
  - rule `day_of_next_month`, value 20;
  - zone `America/Mexico_City`;
  - rate 60
- **THEN** the account stores those values and the response returns them

#### Scenario: Field on a non-card account
- **WHEN** a `checking` account is updated with `creditLimit`
- **THEN** the response is 400 naming `creditLimit` and nothing changes

#### Scenario: Incomplete cycle configuration
- **WHEN** a card is updated with `statementClosingDay` but no `paymentDueRule`
- **THEN** the response is 400 and nothing changes

#### Scenario: Due date after the next closing
- **WHEN** a card with closing day 20 is given rule `day_of_next_month` with value 25, or rule `days_after_closing` with value 35
- **THEN** the response is 400 naming `paymentDueValue`

#### Scenario: Existing cards
- **WHEN** a `credit_card` account has none of the new fields
- **THEN** it keeps working, with debt shown and no available credit, utilization or billing periods

### Requirement: Derived card metrics

For a `credit_card` account, the system SHALL derive these values from the existing account balance (B-006 exact-decimal calculation, in the account currency):
- outstanding debt = max(0, −balance);
- credit balance = max(0, balance).

When a limit is set, it SHALL also derive:
- available credit = limit + balance;
- utilization = debt / limit, as a percentage;
- over limit = available credit < 0.

None of these values SHALL be stored. API, MCP and the web app SHALL show the same derived values.

#### Scenario: Purchase
- **WHEN** a debit account holds 20000 MXN, and a card with limit 30000 MXN and balance 0 records a 5000 MXN expense
- **THEN** the debit account still holds 20000, card debt is 5000, available credit is 25000 and utilization is 16.67%

#### Scenario: Over limit
- **WHEN** a card with limit 30000 has balance −31000
- **THEN** available credit is −1000 and the card is marked over limit

#### Scenario: Credit balance
- **WHEN** a card with limit 30000 has balance +500
- **THEN** debt is 0, credit balance is 500 and available credit is 30500

### Requirement: Card transaction semantics

The existing transaction types SHALL behave as follows on a credit-card account, with no new type and no card-specific balance code:
- **Expense on the card:** increases debt and reduces available credit. It is a purchase, a confirmed interest charge, a fee or another debit, and it counts as an expense when incurred.
- **Income on the card:** reduces debt and increases available credit, with no source account. It is a payment, refund, cashback or other credit against the liability, and it is never ordinary earned income.
- **Transfer into the card:** reduces the source balance and the card debt, and is recognized automatically as a debt repayment. It creates no income or expense. When both accounts are tracked, it does not change net worth.
- **Transfer out of the card:** increases card debt and credits the destination. It is neither a payment nor income.

Every write path (web, `/v1`, MCP, Notification Models, booked imports, settlements) SHALL use the same domain logic.

#### Scenario: Payment by transfer
- **WHEN** 6000 is transferred from a debit account holding 20000 into a card owing 12000
- **THEN** the debit balance is 14000, card debt is 6000, income and expenses are unchanged, and net worth is unchanged

#### Scenario: Income on the card
- **WHEN** a 500 income is recorded on a card owing 5000
- **THEN** card debt is 4500, no other account changes, and no income total increases

#### Scenario: Transfer out of the card
- **WHEN** 1000 is transferred from the card to a debit account
- **THEN** card debt rises by 1000, the debit balance rises by 1000, nothing is recognized as a payment, and no income is reported

### Requirement: Card entry classification

A transaction MAY carry `creditCardKind`. The allowed values depend on the transaction:

| Value | Allowed on | Meaning |
|---|---|---|
| `payment` | income on a `credit_card` account | an external payment from money FlowLedger doesn't track |
| `refund` | income on a `credit_card` account | a merchant refund; it requires `expenseOffsetCategoryId` (the refunded category) |
| `cashback` | income on a `credit_card` account | a reward credit |
| `interest` | expense on a `credit_card` account | a confirmed interest charge |
| none | any transaction | ordinary entry; on card income it means "other credit" |

A transfer into a card is always a repayment and SHALL NOT carry a value. Any other combination, or a `refund` without `expenseOffsetCategoryId`, SHALL return 400 naming the field. The field SHALL be accepted on create and update through the web API, `/v1` and MCP, and SHALL be cleared when the transaction no longer qualifies.

The classification is informational. It SHALL NOT change any balance, billing figure or debt effect; all card income reduces debt equally.

#### Scenario: Classified credits
- **WHEN** card income of 3000 `payment`, 400 `refund` (offset Groceries), 50 `cashback` and 20 unclassified are recorded
- **THEN** debt falls by 3470 in total, and each appears under its own label

#### Scenario: Refund without a refunded category
- **WHEN** card income classified `refund` is sent without `expenseOffsetCategoryId`
- **THEN** the response is 400 naming `expenseOffsetCategoryId`

#### Scenario: Invalid classification
- **WHEN** `creditCardKind: "payment"` is sent on an expense, on income into a `checking` account, or on a transfer
- **THEN** the response is 400 naming `creditCardKind`

### Requirement: Gross and Net reporting of card activity

Reports SHALL keep their existing Gross/Net semantics for non-card accounts:
- Gross Income is all income;
- Net Income excludes reimbursement-offset income;
- Net Expenses = gross expenses − reimbursements.

Income on `credit_card` accounts SHALL be excluded from both Gross and Net income totals, from income-category rows, from the transactions-list income sum and from the savings rate. Income on a card that carries `expenseOffsetCategoryId` SHALL still count as a reimbursement, so Net Expenses are not overstated.

The report summary (and therefore the dashboard and MCP `get_report`) SHALL add a separate figure, `creditCardCredits`, reported in both Gross and Net modes. It sums transfers into cards and all card income within the filters, broken down as:
- transfers from tracked accounts;
- external payments;
- refunds;
- cashback;
- other credits.

Transfers between non-card accounts stay excluded as today. Expenses and expense-category reports are unchanged.

#### Scenario: Salary and card payment
- **WHEN** the starting position is a debit account holding 10000 and card debt of 5000, and then:
  - salary of 8000 is received into the debit account;
  - 2000 is spent on the card;
  - 3000 is transferred from debit to the card
- **THEN** the reports show:
  - Gross and Net Income are 8000;
  - Gross and Net Expenses are 2000;
  - income minus expenses is 6000;
  - `creditCardCredits` is 3000 (transfers 3000);
  - net worth rises by 6000 (debit 15000, card −4000), only from the income and the expense

#### Scenario: External payment
- **WHEN** a card owing 10000 records income of 3000 classified `payment`
- **THEN** debt is 7000, available credit rises by 3000, no source account is created, Gross and Net Income are unchanged, `creditCardCredits` rises by 3000 (external payments), and net worth rises by 3000 with no offsetting expense

#### Scenario: Refund
- **WHEN** a 1000 Groceries purchase on the card is followed by a 400 card income classified `refund` with offset category Groceries
- **THEN** debt rises by 600 in total, Gross Expenses are 1000, Net Expenses are 600, Groceries net is 600, Gross and Net Income are unchanged, and `creditCardCredits` shows refunds 400

#### Scenario: Cashback
- **WHEN** a 50 card income classified `cashback` is recorded
- **THEN** debt falls by 50, available credit rises by 50, income and expenses are unchanged, `creditCardCredits` shows cashback 50, and net worth rises by 50 exactly once

#### Scenario: No duplicate expense
- **WHEN** a 2000 card purchase is later paid by a 2000 debit-to-card transfer
- **THEN** expenses include 2000 exactly once, `creditCardCredits` shows 2000, no income is reported, and net worth fell by 2000 only at the purchase

#### Scenario: Non-card reporting unchanged
- **WHEN** a user has no credit-card accounts
- **THEN** every report total equals its value before this change, and `creditCardCredits` is 0

### Requirement: Liability treatment in net worth

Net worth SHALL include a card's signed balance, so outstanding debt reduces it and a credit balance increases it. Available credit, limits and interest estimates SHALL NOT be included in net worth, cash or owned assets. Any figure combining owned money with credit SHALL label the borrowed portion separately.

#### Scenario: Purchase lowers net worth
- **WHEN** a 5000 card purchase is recorded
- **THEN** net worth falls by 5000

#### Scenario: Limit is not wealth
- **WHEN** the card limit is raised from 30000 to 50000
- **THEN** net worth and every cash total are unchanged

### Requirement: Debit cards are not inferred as credit cards

Provider account type inference SHALL classify names containing "debit" or "débito" (case-insensitive, with or without the accent) as `checking`, before any `card` or `tarjeta` rule applies. Existing accounts SHALL NOT be migrated; the user corrects them by changing the type. The behavior of non-card accounts SHALL NOT change.

#### Scenario: Synced debit card
- **WHEN** a provider account named "Tarjeta de Débito" or "Debit Card" is synced
- **THEN** it is created with type `checking`

#### Scenario: Synced credit card
- **WHEN** a provider account named "Tarjeta de Crédito" is synced
- **THEN** it is created with type `credit_card`
