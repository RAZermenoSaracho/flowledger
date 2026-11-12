# transaction-sharing-conversion Specification

## Purpose
Converting existing transactions to shared expenses and editing their participants atomically through the transaction update request.

## Requirements

### Requirement: Convert an existing transaction to shared

From the Sharing tab of ST-007's Transaction Form View, the owner of an existing, not-yet-shared non-transfer transaction SHALL be able to enable sharing, pick participants, allocate shares, review totals (allocated, owner's own share, unallocated) and save, in the same draft and with the same Save as every other field. The tab SHALL use `RelatedList` and `EditableField` and SHALL NOT introduce a competing form or view. It SHALL work at mobile and desktop widths.

#### Scenario: Convert on mobile
- **WHEN** a user at 375px width opens an unshared expense, enables sharing, adds a participant, sets a share and saves
- **THEN** the transaction becomes shared with that participant, with no horizontal page scroll

#### Scenario: Convert on desktop
- **WHEN** a user at desktop width does the same
- **THEN** the transaction becomes shared with that participant

#### Scenario: Convert with other edits
- **WHEN** the user changes the description and enables sharing in one session and saves
- **THEN** both changes are stored by one request

#### Scenario: Transfer cannot be shared
- **WHEN** the transaction type is `transfer`
- **THEN** sharing cannot be enabled and the server rejects `sharedExpense.enabled: true`

#### Scenario: Shares over the amount
- **WHEN** the allocated shares exceed the transaction amount
- **THEN** Save is disabled with a field error on the offending row and the server rejects with 400

### Requirement: Edit an existing shared transaction

The owner SHALL be able, in the same draft, to change the title, the shares, and to add or remove participants of an existing shared transaction. Saving SHALL diff participants by `id`/`userId`, preserving `paidAmount` and `status`, and SHALL NOT delete and recreate rows.

#### Scenario: Change a share
- **WHEN** the owner raises an unpaid participant's share and saves
- **THEN** the row keeps its identity and `paidAmount`, and the consent rules apply

#### Scenario: Add and remove participants
- **WHEN** the owner adds one participant and removes an unpaid one in one save
- **THEN** both changes apply atomically and the affected participants are notified

#### Scenario: Client payment fields ignored
- **WHEN** a request sends `paidAmount` or payment `status` for a participant
- **THEN** the values are ignored and the stored values are unchanged

#### Scenario: Atomic failure keeps the draft
- **WHEN** a save fails with 400, 409 or a network error
- **THEN** the server is unchanged, the draft keeps all edits, an error is shown and Save can be retried

### Requirement: Disable sharing when safe

The owner SHALL be able to disable sharing (`sharedExpense: { enabled: false }`) only while no participant has `paidAmount > 0` and no pending or approved settlement request exists. Otherwise the server SHALL respond 400 with a message naming what to settle or reverse first, and the toggle SHALL show why it is locked.

#### Scenario: Disable with no payments
- **WHEN** the owner disables sharing and saves with no payments or settlements
- **THEN** the shared expense and participants are removed, the transaction remains, and affected participants are notified

#### Scenario: Disable blocked
- **WHEN** any participant has a payment or a pending/approved settlement
- **THEN** the response is 400, nothing changes, and the draft is kept

### Requirement: Settlement-sensitive guards on every entry point

The server SHALL enforce these rules identically on `PUT /transactions/:id`, `PUT /shared-expenses/:id`, `DELETE /shared-expenses/:id` and `DELETE /transactions/:id`, through one shared helper, each as a 400 with a field-addressable message:
- a share SHALL NOT drop below `paidAmount` plus pending settlement requests;
- a participant SHALL be removable only with `paidAmount = 0` and no pending request;
- unsharing and deleting the shared expense or the transaction SHALL be rejected while any payment or pending/approved settlement exists;
- an expense-to-income flip, and switching to `transfer`, SHALL be rejected when payments or pending requests exist;
- a fully paid share SHALL be locked;
- the sum of shares SHALL NOT exceed the transaction amount.

#### Scenario: Lower share below paid
- **WHEN** a share is lowered below its `paidAmount` plus pending requests
- **THEN** the response is 400 on that participant's share field

#### Scenario: Remove a paid participant
- **WHEN** the owner removes a participant with `paidAmount > 0` or a pending request
- **THEN** the response is 400 and the participant remains

#### Scenario: Delete transaction with settlements
- **WHEN** `DELETE /transactions/:id` targets a transaction whose shared expense has a payment or pending/approved settlement
- **THEN** the response is 400 and the transaction, shares and settlements remain

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

### Requirement: Duplicate conversion returns 409

Converting a transaction that already has a shared expense SHALL return 409 "This transaction is already shared" instead of a raw unique-constraint error.

#### Scenario: Second conversion
- **WHEN** `POST /shared-expenses` is called for a transaction that is already shared
- **THEN** the response is 409 with that message and nothing changes

### Requirement: Sharing changes are owner-scoped

All sharing operations SHALL scope by the authenticated owner in the Prisma `where`; another user's transaction or shared expense SHALL yield not-found, and a participant SHALL NOT be able to edit the structure.

#### Scenario: Foreign transaction
- **WHEN** user A saves `sharedExpense` on user B's transaction
- **THEN** the response is 404 and B's data is unchanged

#### Scenario: Participant edit attempt
- **WHEN** a participant calls `PUT /shared-expenses/:id`
- **THEN** the response is 404
