## ADDED Requirements

### Requirement: Group summary valuation in the preferred currency
The group summary SHALL NOT add amounts across currencies. It SHALL convert each currency to the viewer's preferred currency at the current rate, label the total as a valuation, and format it in that currency.

#### Scenario: Mixed currencies
- **WHEN** a group has balances in MXN and BTC and the viewer prefers USD
- **THEN** each is converted to USD separately, the total is labeled a valuation, and no raw MXN and BTC figures are added
