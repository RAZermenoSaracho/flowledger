## MODIFIED Requirements

### Requirement: Disable sharing when safe

The owner SHALL be able to disable sharing (`sharedExpense: { enabled: false }`) only while no participant has `paidAmount > 0` and no pending or approved settlement request exists. Otherwise the server SHALL respond 400 with a message naming the cause (recorded payments or approved settlements, which cannot be undone by deleting, or a pending request to reject first), and the toggle SHALL show why it is locked.

#### Scenario: Disable with no payments
- **WHEN** the owner disables sharing and saves with no payments or settlements
- **THEN** the shared expense and participants are removed, the transaction remains, and affected participants are notified

#### Scenario: Disable blocked
- **WHEN** any participant has a payment or a pending/approved settlement
- **THEN** the response is 400, nothing changes, and the draft is kept

### Requirement: Settlement-sensitive guards on every entry point

The server SHALL enforce these rules identically on `PUT /transactions/:id`, `PUT /shared-expenses/:id` and `DELETE /shared-expenses/:id`, through one shared helper, each as a 400 with a field-addressable message:
- a share SHALL NOT drop below `paidAmount` plus pending settlement requests;
- a participant SHALL be removable only with `paidAmount = 0` and no pending request;
- unsharing and deleting the shared expense SHALL be rejected while any payment or pending/approved settlement exists;
- an expense-to-income flip, and switching to `transfer`, SHALL be rejected when payments or pending requests exist;
- a fully paid share SHALL be locked;
- the sum of shares SHALL NOT exceed the transaction amount.

`DELETE /transactions/:id` SHALL NOT be refused because of payments or settlements; see "Deleting a transaction never changes another user's records".

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

## ADDED Requirements

### Requirement: Deleting a transaction never changes another user's records

Deleting a transaction SHALL remove only the deleting user's transaction, notifications and own-history rows. It SHALL NOT delete or modify any other user's transaction, share, paid amount, settlement request or status, balance or report figure. A participant with a financial stake (accepted share, `paidAmount > 0`, or any settlement request in any status) SHALL keep the shared expense, shares and requests, which are detached from the deleted transaction (`transactionId` null) with the transaction's type, date, group and category stored on the shared expense. A shared expense without such a participant SHALL be removed, and its proposed or rejected participants notified. Participants without a stake on a detached expense SHALL be removed and notified. Stake holders SHALL receive one notification. The operation SHALL be atomic.

#### Scenario: Owner deletes a fully paid, approved shared expense transaction
- **WHEN** the owner deletes a transaction whose participant paid the full share through an approved settlement
- **THEN** the response is 204, the owner's transaction is gone, the shared expense, share, `paidAmount`, settlement request and the participant's settlement transaction are unchanged, and the participant's debt figures and reports are unchanged

#### Scenario: Owner deletes with a partial payment
- **WHEN** the share is partly paid with a pending request for the rest
- **THEN** the transaction is deleted, the outstanding amount and pending request are unchanged, and the request can still be approved

#### Scenario: Only proposed or rejected shares
- **WHEN** the owner deletes a transaction whose user participants are all proposed or rejected with no requests
- **THEN** the shared expense and those shares are removed, those users are notified, and no participant balance changes

#### Scenario: Accepted unpaid share
- **WHEN** the owner deletes the transaction of an accepted, unpaid share
- **THEN** the share remains owed, `originRemoved` is true for both users, and the participant is notified once

#### Scenario: Another user's transaction
- **WHEN** a participant calls delete with the owner's transaction id
- **THEN** the response is 404 and nothing changes

#### Scenario: Atomic failure
- **WHEN** any write inside the delete fails
- **THEN** the transaction, shared expense, participants, requests, notifications and correction rows are unchanged

#### Scenario: Notifications are user-scoped
- **WHEN** the owner deletes the transaction
- **THEN** only notifications belonging to the owner are removed

### Requirement: Deleting a settlement transaction removes only the deleter's record

Deleting a transaction created by an approved settlement SHALL remove only that user's transaction and clear only that user's side of the settlement request link. The request status, `paidAmount`, the other user's transaction and link, and every balance and report of the other user SHALL be unchanged. Both users deleting their settlement transactions, in either order, SHALL leave the request approved and the share paid.

#### Scenario: Debtor deletes first, creditor second
- **WHEN** the debtor deletes their settlement transaction and later the creditor deletes theirs
- **THEN** after the first delete the creditor's transaction, request and balances are unchanged, and after the second the request is approved with both links null

#### Scenario: Creditor deletes first, debtor second
- **WHEN** the order is reversed
- **THEN** the final state is the same and the debtor's outstanding amount never changes

#### Scenario: Unrelated user
- **WHEN** a user who is neither debtor nor creditor deletes the settlement transaction id
- **THEN** the response is 404
