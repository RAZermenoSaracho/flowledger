## MODIFIED Requirements

### Requirement: Account view tabs and related transactions

The account view SHALL pass `tabs` to the shared Form View: "General" (all editable fields, type sections and sync panel) and "Transactions". Transactions SHALL list the account's transactions newest first (date descending, then id descending), loaded server-side 20 rows at a time through the existing `GET /transactions` endpoint filtered by `accountId`. It SHALL use the shared related-transactions list (also used by the Group view): the shared search bar with name search and the transaction sort options, and the shared pagination control showing the editable record range with Previous/Next, with loading, empty and error states. Each row SHALL link to the transaction and show date, category and amount. No new endpoint is introduced and ownership remains enforced by the server.

#### Scenario: Tabs shown
- **WHEN** an account view is opened
- **THEN** the General and Transactions tabs are shown and General is active

#### Scenario: Paging
- **WHEN** the user opens Transactions and presses Next
- **THEN** rows 21 to 40 are requested with the same `accountId` filter and shown, and Previous returns to rows 1 to 20

#### Scenario: Empty and error
- **WHEN** the account has no transactions, or the request fails
- **THEN** an empty message, or an error message, is shown instead of rows
