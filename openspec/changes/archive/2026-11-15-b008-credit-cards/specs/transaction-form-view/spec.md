# Spec Delta

## MODIFIED Requirements

### Requirement: New transaction drafts open at their own URL

`/transactions/new` SHALL open an unsaved draft that creates nothing until the user saves. Initial values MAY be supplied through whitelisted query parameters, which include `transferToAccountId` and `creditCardKind`. Unknown or invalid parameters SHALL be ignored. The list page's add control SHALL open this route, and the inline create card SHALL no longer exist. A new draft SHALL default the date and time to now.

#### Scenario: Prefilled draft
- **WHEN** a user opens `/transactions/new?type=expense&amount=25&description=Lunch`
- **THEN** the draft shows those values and no transaction exists yet

#### Scenario: Prefilled card payment
- **WHEN** a user opens `/transactions/new?type=transfer&amount=4000&transferToAccountId=<card>`
- **THEN** the draft is a transfer into that card for 4000, and the user still chooses the source account

#### Scenario: Prefilled external payment
- **WHEN** a user opens `/transactions/new?type=income&accountId=<card>&creditCardKind=payment&amount=4000`
- **THEN** the draft is an income on the card, classified as a payment

#### Scenario: Leave without saving
- **WHEN** the user cancels or navigates away from a prefilled draft
- **THEN** no transaction is created

#### Scenario: Save creates one transaction
- **WHEN** the user saves a valid new draft
- **THEN** one transaction is created and the user lands on its `/transactions/:id` view

#### Scenario: Invalid parameter ignored
- **WHEN** the URL carries an unknown parameter or `amount=abc`
- **THEN** that value is ignored and the form opens with defaults for it

#### Scenario: Create from the list
- **WHEN** the user activates the add control on the transactions list
- **THEN** the app opens `/transactions/new`

### Requirement: Coupled fields follow domain rules

Field couplings SHALL be implemented as pure functions owned by the Transactions page and used by both the new-draft and existing-transaction views.
- Choosing an account SHALL set the transaction currency from that account.
- Choosing type transfer SHALL clear category, group, sharing and `creditCardKind`, and SHALL require a destination account different from the source.
- When the account is a credit card, a "Card entry" field SHALL be shown:
  - for income: Payment, Refund (which asks for the refunded category, stored as `expenseOffsetCategoryId`), Cashback or Other credit;
  - for expense: Interest or Charge.

  Card income does not ask for a category.

  Choosing any other account or type SHALL clear it.
- Changing group SHALL reset the category and force sharing to match the group rule.

#### Scenario: Account sets currency
- **WHEN** the user selects an account whose currency is EUR
- **THEN** the transaction currency becomes EUR

#### Scenario: Transfer clears related fields
- **WHEN** the user changes the type to transfer on a transaction with category, group and sharing set
- **THEN** category, group and sharing are cleared

#### Scenario: Card entry only on cards
- **WHEN** the user switches the account of an income classified Payment from a card to a checking account
- **THEN** the Card entry field disappears and the classification is cleared

#### Scenario: Group change resets category
- **WHEN** the user changes the group
- **THEN** the category is reset and sharing follows the group rule
