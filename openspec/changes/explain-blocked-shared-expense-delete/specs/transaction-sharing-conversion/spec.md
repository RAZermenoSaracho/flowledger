## MODIFIED Requirements

### Requirement: Disable sharing when safe

The owner SHALL be able to disable sharing (`sharedExpense: { enabled: false }`) only while no participant has `paidAmount > 0` and no pending or approved settlement request exists. Otherwise the server SHALL respond 400 with a message naming the cause (recorded payments or approved settlements, which cannot be reversed, or a pending request to reject first), and the toggle SHALL show why it is locked.

#### Scenario: Disable with no payments
- **WHEN** the owner disables sharing and saves with no payments or settlements
- **THEN** the shared expense and participants are removed, the transaction remains, and affected participants are notified

#### Scenario: Disable blocked
- **WHEN** any participant has a payment or a pending/approved settlement
- **THEN** the response is 400, nothing changes, and the draft is kept

## ADDED Requirements

### Requirement: Blocked deletion states its cause and is shown in the web app

When `DELETE /transactions/:id`, `DELETE /shared-expenses/:id` or unsharing is refused because of settlement activity, the 400 message SHALL name the participant and the cause: recorded payments or approved settlements ("cannot be reversed"), or a pending settlement request ("reject it first"). It SHALL NOT tell the user to reverse payments, since no reversal exists. The web transaction list and detail page SHALL display that message when a delete fails, and the delete confirmation SHALL NOT claim that settlements are removed unconditionally.

#### Scenario: Paid share blocks delete with explanation
- **WHEN** the owner confirms deleting a transaction whose participant has `paidAmount > 0` or an approved settlement
- **THEN** the response is 400 stating the payments cannot be reversed, the transaction and settlements remain, and the web page shows that message

#### Scenario: Pending request blocks delete with next step
- **WHEN** a participant has only a pending settlement request
- **THEN** the 400 message tells the owner to reject the request first

#### Scenario: Rejected request does not block
- **WHEN** the only settlement activity is rejected requests and `paidAmount = 0`
- **THEN** the delete succeeds and removes the shared expense, participants and requests

#### Scenario: Foreign transaction
- **WHEN** user A deletes user B's transaction
- **THEN** the response is 404 with no settlement information
