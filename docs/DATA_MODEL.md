# Data Model

Source of truth: `database/prisma/schema.prisma`

---

## Enums

| Enum | Values |
|---|---|
| `CategoryType` | `income`, `expense` |
| `TransactionType` | `income`, `expense`, `transfer` |
| `AccountType` | `cash`, `checking`, `savings`, `credit_card`, `investment`, `other` |
| `SharedExpenseStatus` | `open`, `settled`, `cancelled` |
| `ParticipantStatus` | `pending`, `partial`, `paid` |
| `SettlementStatus` | `pending`, `approved`, `rejected` |
| `GroupRole` | `admin`, `member` |
| `NotificationType` | `group_member_added`, `shared_expense_added`, `debt_owes_money`, `debt_owed_money`, `settlement_requested`, `settlement_approved`, `settlement_rejected`, `settlement_payment_registration_needed`, `provider_transactions_pending` |

---

## Models

### User

Core user record. All user-owned data cascades on delete.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `name` | String | Display name |
| `email` | String | Unique, used for login |
| `passwordHash` | String? | Null for OAuth-only users |
| `avatarUrl` | String? | URL to avatar image |
| `planType` | String | Default `"free"` |
| `createdAt` / `updatedAt` | DateTime | Auto-managed |

Relations: `authAccounts`, `accounts`, `transactions`, `providerConnections`, `providerAccounts`, `providerImportedTransactions`, `providerWebhookEvents`, `ownedSharedExpenses`, `sharedExpenseParticipations`, `settlementRequestsMade`, `settlementRequestsReceived`, `groupMemberships`, `ownedGroups`, `notifications`

---

### UserAuthAccount

OAuth and provider user mappings. Also used to store the Syncfy `idUser → FlowLedger user` mapping.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `userId` | String | FK → User |
| `provider` | String | `"google"`, `"syncfy"`, etc. |
| `providerAccountId` | String | Provider's user/account ID |
| `email` | String | Email on the provider account |

Unique: `(provider, providerAccountId)`

---

### Account

A financial account owned by a user. Can be manual (user-created) or linked to a provider account.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `userId` | String | FK → User |
| `name` | String | Display name |
| `type` | AccountType | Enum |
| `identifier` | String? | Last 4 digits, IBAN tail, etc. |
| `initialBalance` | Decimal(12,2) | Starting balance |
| `isArchived` | Boolean | Soft delete |
| `archivedAt` | DateTime? | When archived |

Relations: `transactions` (from account), `transferDestinationTransactions` (to account in transfers), `providerAccounts`

---

### Category

A transaction category. Can be personal (no group) or group-scoped.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `groupId` | String? | FK → Group (null = personal category) |
| `name` | String | Display name |
| `type` | CategoryType | `income` or `expense` |
| `color` | String? | Hex color for UI |
| `isArchived` | Boolean | Soft delete |

Relations: `users` (CategoryUser), `transactions`, `expenseOffsetTransactions`, `providerImportedTransactions`

---

### CategoryUser

Many-to-many join between Category and User. A user must be linked to a category to use it.

| Field | Notes |
|---|---|
| `categoryId` + `userId` | Unique composite |

---

### Transaction

A financial transaction. The core financial record.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `userId` | String | FK → User (owner) |
| `name` | String | Description / merchant |
| `amount` | Decimal(12,2) | Always positive; type indicates direction |
| `type` | TransactionType | `income`, `expense`, `transfer` |
| `date` | DateTime | Transaction date |
| `categoryId` | String? | FK → Category |
| `expenseOffsetCategoryId` | String? | For income that offsets an expense category |
| `groupId` | String? | FK → Group (group transaction) |
| `accountId` | String? | FK → Account (source account) |
| `transferToAccountId` | String? | FK → Account (destination, transfers only) |
| `notes` | String? | User notes |

Key constraints:
- Transfer transactions: `accountId` and `transferToAccountId` required, no category or group.
- `expenseOffsetCategoryId` only allowed on income transactions. Used for settlement payments received that offset an expense.
- `sharedExpense` (one-to-one optional): transaction can have an attached shared expense.

Relations: `relations` / `relatedBy` (TransactionRelation), `sharedExpense`, `debtorSettlementRequest`, `creditorSettlementRequest`, `providerImportedTransaction`

---

### TransactionRelation

Directed relationship between two transactions.

| Field | Type | Notes |
|---|---|---|
| `transactionId` | String | FK → Transaction |
| `relatedTransactionId` | String | FK → Transaction |
| `relationType` | String | Currently `"settlement_payment"` |

When a settlement is approved, two reciprocal relations are created (one for the debtor transaction, one for the creditor transaction).

---

### Group

A shared group (replaces old "Household" concept). Groups own categories and contain transactions.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `name` | String | Group name |
| `description` | String? | Optional description |
| `ownerUserId` | String | FK → User (creator / admin) |
| `isArchived` | Boolean | Soft delete |

Relations: `members` (GroupMember), `categories`, `transactions`

---

### GroupMember

Membership record linking a User to a Group.

| Field | Type | Notes |
|---|---|---|
| `groupId` | String | FK → Group |
| `userId` | String | FK → User |
| `role` | GroupRole | `admin` or `member` |

Unique: `(groupId, userId)`

---

### SharedExpense

An expense split across multiple participants. Attached 1:1 to a Transaction.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `transactionId` | String (unique) | FK → Transaction |
| `ownerUserId` | String | FK → User (who paid) |
| `title` | String | Display title |
| `totalAmount` | Decimal(12,2) | Total expense amount |
| `status` | SharedExpenseStatus | `open`, `settled`, `cancelled` |

Relations: `participants` (SharedExpenseParticipant)

---

### SharedExpenseParticipant

One participant's share of a shared expense. Can be a registered user or a named non-user.

| Field | Type | Notes |
|---|---|---|
| `sharedExpenseId` | String | FK → SharedExpense |
| `userId` | String? | FK → User (null for non-registered participants) |
| `participantName` | String | Display name |
| `shareAmount` | Decimal(12,2) | What they owe |
| `paidAmount` | Decimal(12,2) | What they've paid so far |
| `status` | ParticipantStatus | `pending`, `partial`, `paid` |

Relations: `settlementRequests` (SettlementRequest)

---

### SettlementRequest

A formal request from a debtor to a creditor to settle a shared expense debt. Triggers transaction creation on approval.

| Field | Type | Notes |
|---|---|---|
| `sharedExpenseParticipantId` | String | FK → SharedExpenseParticipant |
| `debtorUserId` | String | FK → User |
| `creditorUserId` | String | FK → User |
| `amount` | Decimal(12,2) | Settlement amount |
| `status` | SettlementStatus | `pending`, `approved`, `rejected` |
| `note` / `paymentInfo` | String? | Optional notes |
| `debtorAccountId` | String? | Debtor's payment account |
| `debtorCategoryId` | String? | Debtor's expense category |
| `creditorAccountId` | String? | Creditor's income account |
| `creditorCategoryId` | String? | Creditor's income category |
| `debtorTransactionId` | String? (unique) | Created on approval |
| `creditorTransactionId` | String? (unique) | Created on approval |
| `approvedAt` | DateTime? | When approved |

---

### Notification

In-app notification for a user.

| Field | Type | Notes |
|---|---|---|
| `userId` | String | FK → User |
| `type` | NotificationType | Enum |
| `title` | String | Short title |
| `message` | String | Full message |
| `readAt` | DateTime? | Null = unread |
| `metadata` | Json? | Typed JSON with context (IDs, counts) |

---

### ProviderConnection

Represents a bank connection credential established through a provider.

| Field | Type | Notes |
|---|---|---|
| `userId` | String | FK → User |
| `provider` | String | `"syncfy"` |
| `providerUserId` | String? | Provider's internal user ID |
| `providerCredentialId` | String | Provider's credential ID (Syncfy `id_credential`) |
| `institutionId` | String? | Bank/institution identifier |
| `institutionName` | String? | Display name |
| `institutionMetadata` | Json? | Raw institution data |
| `status` | String | `active`, `sync_failed`, `reconnect_required` |
| `failureReason` | String? | Error message if failed |
| `requiresManualReconnect` | Boolean | True when user must re-auth via widget |
| `lastSyncAt` / `lastSyncSuccessAt` / `lastSyncFailureAt` | DateTime? | Sync timestamps |
| `rawData` | Json? | Stores sanitized `syncfyRefreshMetadata` (endpoint paths, no secrets) |

Unique: `(provider, providerCredentialId)`

---

### ProviderAccount

A bank account imported from a provider. Links to a user's FlowLedger Account once confirmed.

| Field | Type | Notes |
|---|---|---|
| `userId` | String | FK → User |
| `connectionId` | String? | FK → ProviderConnection |
| `accountId` | String? | FK → Account (null until confirmed) |
| `provider` | String | `"syncfy"` |
| `providerCredentialId` | String | Provider credential |
| `providerAccountId` | String | Provider's account ID |
| `accountMetadata` | Json? | `{name, type, currency, balance}` |
| `status` | String | `active`, `sync_failed`, `reconnect_required` |
| `requiresManualReconnect` | Boolean | True when connection requires re-auth |
| `rawData` | Json? | Raw provider response |

Unique: `(provider, providerCredentialId, providerAccountId)`

---

### ProviderImportedTransaction

A transaction fetched from a provider and staged for user review. Becomes a Transaction on import.

| Field | Type | Notes |
|---|---|---|
| `userId` | String? | FK → User |
| `connectionId` | String? | FK → ProviderConnection |
| `providerAccountRefId` | String? | FK → ProviderAccount |
| `transactionId` | String? (unique) | FK → Transaction (set on import) |
| `categoryId` | String? | Pre-selected category |
| `provider` | String | `"syncfy"` |
| `providerTransactionId` | String | Provider's transaction ID |
| `providerCredentialId` | String | Provider credential |
| `providerAccountId` | String | Provider account |
| `description` | String | Raw transaction description |
| `amount` | Decimal(12,2) | Negative = expense, positive = income |
| `currency` | String | ISO currency code |
| `transactionDate` | DateTime | Transaction date |
| `refreshDate` | DateTime? | When provider refreshed it |
| `status` | String | `pending`, `processed`, `ignored`, `imported` |
| `rawData` | Json | Raw provider response |

Unique: `(provider, providerTransactionId)`

Status lifecycle: `pending` → `processed` (imported by user) or `ignored` (user dismissed). `imported` is a legacy status that resolves to `pending` (no transaction linked) or `processed` (transaction linked).

---

### ProviderWebhookEvent

Audit log of all incoming webhook events from providers.

| Field | Type | Notes |
|---|---|---|
| `userId` | String? | Resolved FlowLedger user |
| `provider` | String | `"syncfy"` |
| `providerEventId` | String | Provider's event ID (or generated) |
| `eventName` | String | Event type (e.g., `credentials.refreshed`) |
| `rawPayload` | Json | Parsed event payload |
| `rawHeaders` | Json | Sanitized request headers (signature fields redacted) |
| `rawBody` | String | Raw body string |
| `receivedAt` | DateTime | When received |
| `processedAt` | DateTime? | When processing completed |
| `status` | String | `received`, `processing`, `processed`, `ignored`, `failed` |
| `errorMessage` | String? | Error if processing failed |

Unique: `(provider, providerEventId)` — prevents duplicate processing.

---

## Key relationships diagram

```
User
 ├── Account (manual or linked to ProviderAccount)
 ├── Transaction → SharedExpense → SharedExpenseParticipant → SettlementRequest
 ├── Category (personal)
 ├── GroupMember → Group → Category (group)
 │                        └── Transaction (group-scoped)
 ├── ProviderConnection → ProviderAccount → Account
 │                     └── ProviderImportedTransaction → Transaction (on import)
 ├── ProviderWebhookEvent
 ├── Notification
 └── UserAuthAccount (Google OAuth mapping, Syncfy user mapping)
```
