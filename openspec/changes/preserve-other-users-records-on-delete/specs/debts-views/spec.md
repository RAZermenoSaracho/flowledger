## ADDED Requirements

### Requirement: Removed originals and settlement transactions are marked

A shared expense whose original transaction was deleted SHALL stay visible to its owner and participants with an "original transaction removed" marker and no link to the missing transaction, and SHALL expose the transaction fields participants need (type, date, group, category) from the stored origin. An approved settlement whose caller-side transaction was deleted SHALL show "your transaction was removed" while status, amount and the shared figures stay unchanged. The shared-expense and transaction delete confirmations SHALL state that other users' shares, payments and settlements are not changed, and a failed delete SHALL show the server message.

#### Scenario: Participant sees a detached expense
- **WHEN** the owner deleted the original transaction of an accepted share
- **THEN** the participant's debts list shows the same outstanding amount and direction, the marker, and no transaction link

#### Scenario: Removed settlement transaction
- **WHEN** a user deleted their approved settlement's transaction
- **THEN** their settlement row shows the marker and the other user's row is unchanged

#### Scenario: Failed delete is explained
- **WHEN** a delete request returns an error
- **THEN** the message is shown on the list and detail pages and the record stays
