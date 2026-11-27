## MODIFIED Requirements

### Requirement: Settlement-sensitive guards on every entry point

The server SHALL enforce these rules identically on `PUT /transactions/:id`, `PUT /shared-expenses/:id` and `DELETE /shared-expenses/:id`, through one shared helper, each as a 400 with a field-addressable message:
- a share SHALL NOT drop below `paidAmount` plus pending settlement requests;
- a participant SHALL be removable only with `paidAmount = 0` and no pending request;
- unsharing and deleting the shared expense SHALL be rejected while any payment or pending/approved settlement exists;
- an expense-to-income flip, and switching to `transfer`, SHALL be rejected when payments or pending requests exist;
- a fully paid share SHALL be locked;
- the sum of shares SHALL NOT exceed the transaction amount.

`DELETE /transactions/:id` SHALL NOT be refused because of payments or settlements; see the `financial-record-independence` capability. The direct shared-expense delete and unshare rule is pending owner decision OD2 and is unchanged here.

#### Scenario: Lower share below paid
- **WHEN** a share is lowered below its `paidAmount` plus pending requests
- **THEN** the response is 400 on that participant's share field

#### Scenario: Remove a paid participant
- **WHEN** the owner removes a participant with `paidAmount > 0` or a pending request
- **THEN** the response is 400 and the participant remains

#### Scenario: Delete transaction with settlements
- **WHEN** `DELETE /transactions/:id` targets a transaction whose shared expense has a payment or pending/approved settlement
- **THEN** the response is 204, only the caller's transaction is removed, and the shares and settlements remain unchanged for the participants

#### Scenario: Delete shared expense with payments
- **WHEN** `DELETE /shared-expenses/:id` targets an expense with a payment
- **THEN** the response is 400 and nothing is deleted

#### Scenario: Direction flip blocked
- **WHEN** the type changes between expense and income while a payment exists
- **THEN** the response is 400 and the type is unchanged

#### Scenario: Fully paid share locked
- **WHEN** an edit targets a fully paid participant's share
- **THEN** the response is 400

#### Scenario: Legacy PUT does not wipe payments
- **WHEN** `PUT /shared-expenses/:id` is called with participants after a participant has paid
- **THEN** that participant's `paidAmount` and settlement requests are preserved
