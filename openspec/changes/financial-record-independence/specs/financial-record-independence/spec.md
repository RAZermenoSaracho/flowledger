## ADDED Requirements

### Requirement: Deleting a transaction never changes another user's records

Deleting a transaction SHALL remove only the deleting user's transaction, own notifications and own-history rows. It SHALL NOT delete or modify any other user's transaction, shared expense, participant share, paid amount, settlement request, status, balance or report figure, and SHALL NOT be refused because of shares, payments or settlements. A linked shared expense SHALL be kept and detached (`transactionId` null) with the transaction's type, currency, date, group and category stored on it at detach time. The operation SHALL be atomic. Status: approved principles A, B, D.

#### Scenario: Original of a fully settled expense
- **WHEN** the owner deletes the original transaction of a share that was fully paid through an approved settlement
- **THEN** the response is 204, the shared expense, share, `paidAmount`, settlement request and both settlement transactions are unchanged, and the participant's debt figures are unchanged

#### Scenario: Accepted unpaid share
- **WHEN** the owner deletes the original transaction of an accepted, unpaid share
- **THEN** the share remains owed and both users see the shared expense with `originTransactionDeleted` true

#### Scenario: Pending request on a detached expense
- **WHEN** a settlement request is pending and the original transaction is deleted
- **THEN** the request remains pending and can still be approved, and approval creates the settlement transactions from the stored origin data

#### Scenario: Another user's transaction
- **WHEN** a participant deletes the owner's transaction id
- **THEN** the response is 404 and nothing changes

#### Scenario: Repeat delete
- **WHEN** the same delete is sent twice
- **THEN** the second response is 404 and nothing changes

#### Scenario: Atomic failure
- **WHEN** any write inside the delete fails
- **THEN** the transaction, shared expense, shares, requests, notifications and correction row are unchanged

#### Scenario: Notifications are user-scoped
- **WHEN** a user deletes a transaction
- **THEN** only notifications whose `userId` is that user are removed

### Requirement: Detached shared expenses keep their history

A shared expense whose original transaction was deleted SHALL stay visible to its owner and authorized participants with its amount, currency, dates, description, shares, accepted obligations, payment history and settlements, and SHALL show an "Original transaction deleted" indicator and no link to the missing transaction. Type, currency, date, group and category SHALL be read through one helper that uses the transaction while attached and the stored origin afterwards. The API SHALL expose `originTransactionDeleted` and a nullable `transaction`. The web SHALL NOT substitute a default currency. Status: approved principle B; proposed mechanism.

#### Scenario: Participant views a detached expense
- **WHEN** the owner deleted the original transaction of an accepted share
- **THEN** the participant sees the same direction, outstanding amount and currency and the indicator

#### Scenario: Direct-settle request is not marked
- **WHEN** an approved settlement was created by direct settle and has no transactions
- **THEN** no "Linked transaction deleted" indicator is shown

### Requirement: Deleting a settlement transaction never reverses the settlement

Deleting a transaction created by an approved settlement SHALL remove only the deleter's transaction and clear and mark only that user's side of the request (`debtorTransactionDeletedAt` or `creditorTransactionDeletedAt`). Request status, `paidAmount`, the share, and the other user's transaction, link and balances SHALL be unchanged, in either deletion order, and no debt SHALL be recreated. The API SHALL expose `debtorTransactionDeleted` and `creditorTransactionDeleted`, and the UI SHALL show "Linked transaction deleted". Reversal is a separate explicit operation (#197). Status: approved principle C.

#### Scenario: Debtor deletes first, creditor second
- **WHEN** the debtor deletes their settlement transaction and later the creditor deletes theirs
- **THEN** after each step the other side's transaction and all balances are unchanged, and finally the request is approved with both sides marked deleted and the share still paid

#### Scenario: Creditor first, debtor second
- **WHEN** the order is reversed
- **THEN** the final state is identical

#### Scenario: Unrelated user
- **WHEN** a user who is neither debtor nor creditor deletes the settlement transaction id
- **THEN** the response is 404

### Requirement: Group and group-category deletion never alters other members' records

Deleting a group or a group category SHALL be refused with 409 and the message "Other members have records in this group. Archive it instead." when any `Transaction`, `ProviderImportedTransaction`, `SharedExpense` (including `originGroupId` and `originCategoryId`) or `SettlementRequest` category reference owned by another user references the group or its categories. The check and the delete SHALL run in one database transaction, including the admin or ownership check. The caller's own references SHALL keep their current behavior. Personal categories SHALL be unchanged. Archive SHALL remain available on every surface. MCP SHALL NOT gain a group delete tool. Status: proposed, subject to OD4.

#### Scenario: Group with another member's transactions
- **WHEN** an admin deletes a group in which another member has transactions
- **THEN** the response is 409, and the group, categories and every transaction are unchanged

#### Scenario: Group with only the caller's records
- **WHEN** the admin is the only user referencing the group
- **THEN** the group is deleted and the caller's references are cleared as before

#### Scenario: Group category with another member's transactions
- **WHEN** a group category referenced by another member's transactions is deleted through REST, `/v1` or MCP
- **THEN** the response is 409 and nothing changes

#### Scenario: Personal category
- **WHEN** a user deletes their own personal category
- **THEN** it is deleted and their transactions become uncategorized

#### Scenario: Archive
- **WHEN** an admin archives a group that other members use
- **THEN** it is archived and other members' records are unchanged
