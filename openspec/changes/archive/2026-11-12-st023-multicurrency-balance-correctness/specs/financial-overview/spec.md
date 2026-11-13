## MODIFIED Requirements

### Requirement: Disclosures
The overview SHALL disclose, only when they apply and grouped in one place, that:
- past-month amounts in other currencies are converted at current rates;
- `investment` accounts count at recorded balance, not market value;
- synced accounts' balances come from recorded transactions and may differ from the bank;
- the savings rate depends on how transactions were recorded, for example a card payment recorded as an expense counts twice.

Cross-currency transfers and transactions in a currency other than their account's SHALL NOT produce a disclosure, because balances use persisted native amounts.

#### Scenario: Nothing applies
- **WHEN** none of the conditions hold
- **THEN** no disclosure list is shown

#### Scenario: Investment account
- **WHEN** the user has an `investment` account
- **THEN** net worth discloses that it counts at recorded balance

#### Scenario: Synced account
- **WHEN** the user has a synced account
- **THEN** net worth discloses that balances may differ from the bank

#### Scenario: Cross-currency
- **WHEN** a cross-currency transfer or a transaction in a currency other than its account's exists
- **THEN** no cross-currency disclosure is shown

#### Scenario: Past month in another currency
- **WHEN** last month includes amounts in a currency other than the preferred one
- **THEN** the savings rate discloses conversion at current rates
