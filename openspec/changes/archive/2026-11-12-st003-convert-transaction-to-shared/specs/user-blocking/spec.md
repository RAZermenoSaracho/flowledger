# Spec Delta

## ADDED Requirements

### Requirement: Block model and endpoints

`UserBlock(blockerId, blockedId, createdAt)` SHALL be unique per pair. `GET /users/blocks` SHALL list the caller's blocks as public identities, `POST /users/blocks` `{ userId }` SHALL create one, and `DELETE /users/blocks/:userId` SHALL remove one, all scoped to the caller. Blocking oneself or an unknown user SHALL be 400.

#### Scenario: Block and list
- **WHEN** a user blocks another
- **THEN** the list shows the blocked user's username (and display name per visibility), no email

#### Scenario: Idempotent block
- **WHEN** the same user is blocked twice
- **THEN** one row exists and the response is successful

#### Scenario: User isolation
- **WHEN** user A lists blocks
- **THEN** only A's blocks are returned

### Requirement: Blocking effects

A blocked user SHALL NOT be able to add the blocker as a participant (400 "This user can't be invited."), and notifications from the blocked user to the blocker SHALL be suppressed. Neither user SHALL appear in the other's search. At block time the blocker's `proposed` shares from the blocked user's expenses SHALL become `rejected`; `accepted` obligations, payments, settlements and Group membership SHALL be unchanged.

#### Scenario: Blocked invite
- **WHEN** a blocked user tries to add the blocker as a participant
- **THEN** the response is 400 with the generic message and nothing is created

#### Scenario: Pending proposals rejected
- **WHEN** a user blocks someone who has proposed shares to them
- **THEN** those shares become `rejected` and accepted shares are unchanged

#### Scenario: Search hides both ways
- **WHEN** A blocks B
- **THEN** neither finds the other through search

### Requirement: Unblocking

`DELETE /users/blocks/:userId` SHALL remove the block and restore nothing automatically: previously rejected shares stay rejected.

#### Scenario: Unblock
- **WHEN** A unblocks B
- **THEN** B can be found and invited again and earlier rejected shares remain rejected

### Requirement: Blocked users tab and Reject and block

Profile SHALL have a "Blocked users" tab using `RelatedList` in immediate mode (unblock applies immediately, no draft). An invitation SHALL offer "Reject and block", which rejects the share and blocks the owner in one action.

#### Scenario: Unblock from the tab
- **WHEN** the user removes a row in Blocked users
- **THEN** the block is deleted immediately and the row disappears

#### Scenario: Reject and block
- **WHEN** the participant chooses "Reject and block" on an invitation
- **THEN** the share is `rejected` and the owner is blocked

#### Scenario: Mobile layout
- **WHEN** the tab is viewed at 375px
- **THEN** rows stack label/value with no horizontal page scroll
