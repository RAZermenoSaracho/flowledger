# shared-expense-consent Specification

## Purpose
Participant consent for shared-expense allocations: proposed, accepted and rejected shares, re-consent on increases, and immutable settled lines.

## Requirements

### Requirement: Acceptance state is separate from payment status

`SharedExpenseParticipant` SHALL carry `acceptance` of `proposed`, `accepted` or `rejected` (default `proposed`), independent of payment `status`. The migration SHALL backfill existing app-user participants as `accepted`.

#### Scenario: New app-user participant
- **WHEN** the owner adds an app-user participant
- **THEN** the row is `proposed`

#### Scenario: Backfill
- **WHEN** the migration is applied to existing data
- **THEN** every existing app-user participant is `accepted` and payment fields are untouched

### Requirement: Only the participant can accept or reject

`POST /shared-expenses/:id/accept` and `/reject` SHALL change only the caller's own participant row (scoped by `sharedExpenseId` and `userId`) and only while it is `proposed`. The same service SHALL be used by web, `/v1` and MCP. No endpoint or payload SHALL let the owner set acceptance.

#### Scenario: Accept
- **WHEN** a participant accepts a proposed share
- **THEN** the row becomes `accepted` and the owner is notified

#### Scenario: Reject
- **WHEN** a participant rejects a proposed share
- **THEN** the row becomes `rejected` and the owner is notified

#### Scenario: Not the participant
- **WHEN** the owner or another user calls accept or reject
- **THEN** the response is 404 and nothing changes

#### Scenario: Not proposed
- **WHEN** the participant calls accept on an already accepted or rejected share
- **THEN** the response is 400 and nothing changes

#### Scenario: Owner cannot override rejection
- **WHEN** the owner re-saves the transaction without changing a rejected participant's amount
- **THEN** the share stays `rejected`

### Requirement: Only accepted shares count

Debts outstanding and totals, person balances, settlement requests and net-worth receivables/payables SHALL include only `accepted` shares. `proposed` shares SHALL be listed as "awaiting acceptance" to both the owner and the participant and not counted. `rejected` shares SHALL not be counted and SHALL be shown to the owner as rejected.

#### Scenario: Proposed not counted
- **WHEN** a share is `proposed`
- **THEN** it appears in "awaiting acceptance" and is absent from outstanding totals and balances

#### Scenario: Accepted counted
- **WHEN** the participant accepts
- **THEN** the share appears in outstanding totals for both users

#### Scenario: Rejected not counted
- **WHEN** a share is `rejected`
- **THEN** it is absent from totals, and the owner sees it as rejected

#### Scenario: Settlement on unaccepted share
- **WHEN** a debtor requests settlement on a `proposed` or `rejected` share
- **THEN** the response is 400

### Requirement: Material changes re-propose

For an `accepted` share, raising the share amount or flipping debt direction SHALL set it to `proposed` and notify the participant. Lowering the share or editing non-financial fields SHALL keep it `accepted`. A `rejected` share SHALL return to `proposed` only when the owner changes its amount.

#### Scenario: Raised share
- **WHEN** the owner raises an accepted share
- **THEN** it becomes `proposed` and the participant gets `shared_expense_updated`

#### Scenario: Direction flip
- **WHEN** the owner flips an accepted share's transaction between expense and income (no payments or pending requests)
- **THEN** it becomes `proposed` and the participant gets `shared_expense_updated`

#### Scenario: Lowered share keeps acceptance
- **WHEN** the owner lowers an accepted share (not below paid)
- **THEN** it stays `accepted`

#### Scenario: Title edit
- **WHEN** only the title or description changes
- **THEN** acceptance is unchanged

#### Scenario: Rejected then new amount
- **WHEN** the owner changes a rejected share's amount
- **THEN** it becomes `proposed` again

### Requirement: Manual participants are always accepted

Participants without an app account SHALL always be `accepted`; they are owner-asserted, informational and cannot respond.

#### Scenario: Manual participant added
- **WHEN** the owner adds a manual participant
- **THEN** the row is `accepted` and no notification is sent

### Requirement: Acceptance notifications with dedup

The system SHALL create `shared_expense_invited` and `shared_expense_updated` (to the participant) and `shared_expense_accepted` and `shared_expense_rejected` (to the owner). There SHALL be at most one unread notification per recipient, shared expense and type; a newer one replaces the unread one. Notifications from a user blocked by the recipient SHALL be suppressed.

#### Scenario: Dedup
- **WHEN** the owner changes a proposal twice before the participant reads the first notification
- **THEN** one unread `shared_expense_updated` exists with the latest content

#### Scenario: Blocked sender
- **WHEN** a blocked user proposes to the blocker
- **THEN** the proposal is refused and no notification is created

### Requirement: Participant response UI

The participant SHALL accept or reject from the Debts "awaiting acceptance" list and from the notification target. There SHALL be no approval dashboard. Both surfaces SHALL work at mobile width and show the owner's public label, amount and share only.

#### Scenario: Respond from Debts
- **WHEN** a participant opens Debts at 375px and taps Accept
- **THEN** the share moves into counted debts

#### Scenario: Respond from notification
- **WHEN** a participant opens an invitation notification
- **THEN** they land on a view offering Accept, Reject and "Reject and block"

#### Scenario: User isolation
- **WHEN** user A opens another user's invitation id
- **THEN** the result is not found

### Requirement: Settled allocations and additional allocation lines

An allocation that is accepted and fully paid SHALL be immutable (share, user, direction, acceptance, removal) and SHALL accept no new settlement request. A share with payments or a pending settlement request SHALL NOT be raised; extra amounts SHALL be added as an additional allocation line for the same user, allowed only when every existing line of that user has payment activity, starting `proposed`. Accept and reject SHALL accept an optional `participantId` to answer one line; without it every proposed line of the caller on that expense is answered.

#### Scenario: Edit a settled allocation
- **WHEN** the owner changes the share of, or removes, a settled allocation
- **THEN** the response is 400 and nothing changes

#### Scenario: Additional line rejected alone
- **WHEN** a participant rejects one additional line with its `participantId`
- **THEN** only that line becomes `rejected` and the settled line and debts are unchanged
