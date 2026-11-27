## ADDED Requirements

### Requirement: Deleted originals and settlement transactions are marked

A shared expense whose original transaction was deleted SHALL stay visible to its owner and participants with an "Original transaction deleted" indicator and no link to the missing transaction, and SHALL expose the transaction fields participants need (type, date, group, category) from the stored origin, without a default currency. An approved settlement created by direct settle SHALL NOT show the indicator. An approved settlement whose caller-side transaction was deleted SHALL show "Linked transaction deleted" while status, amount and the shared figures stay unchanged. The transaction delete confirmation SHALL state that other users' shares, payments and settlements are not changed, and a failed delete SHALL show the server message. Delete group and category actions SHALL show the 409 reason and offer Archive.

#### Scenario: Participant sees a detached expense
- **WHEN** the owner deleted the original transaction of an accepted share
- **THEN** the participant's debts list shows the same outstanding amount and direction, the indicator, and no transaction link

#### Scenario: Removed settlement transaction
- **WHEN** a user deleted their approved settlement's transaction
- **THEN** their settlement row shows the indicator and the other user's row is unchanged

#### Scenario: Failed delete is explained
- **WHEN** a delete request returns an error
- **THEN** the message is shown on the list and detail pages and the record stays
