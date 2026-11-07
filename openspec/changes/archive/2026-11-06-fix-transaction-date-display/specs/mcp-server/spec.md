# Spec Delta

## MODIFIED Requirements

### Requirement: Search and summary filtering
`search_transactions` SHALL accept optional `dateFrom`, `dateTo`, `accountId`, `categoryId`, `text`, `type`, `page` and `pageSize`, return transactions newest first, and cap `pageSize` at 100 (default 50). `get_transaction_summary` SHALL accept the same filters except paging and return income, expenses and balance for the matching transactions. `dateFrom` and `dateTo` SHALL each accept a datetime, normalized to UTC, or a bare `YYYY-MM-DD` UTC calendar day. `dateFrom` SHALL be inclusive, a datetime `dateTo` SHALL be exclusive, and a bare `dateTo` SHALL include that whole UTC day. Inputs outside the schema, including `pageSize` above 100, SHALL be rejected.

#### Scenario: Filtered search
- **WHEN** a client searches with `type: "expense"` and a bare date range
- **THEN** only the user's expense transactions within those whole UTC days are returned with paging metadata

#### Scenario: Local-day boundaries
- **WHEN** a client searches with `dateFrom` of `2026-11-05T06:00:00.000Z` and `dateTo` of `2026-11-06T06:00:00.000Z`
- **THEN** a transaction at `2026-11-05T06:00:00.000Z` is returned and a transaction at `2026-11-06T06:00:00.000Z` is not

#### Scenario: Page size cap
- **WHEN** a client searches with `pageSize: 101`
- **THEN** the call is rejected with a validation error
