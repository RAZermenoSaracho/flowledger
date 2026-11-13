# Spec Delta

## ADDED Requirements

### Requirement: Shared prefill on new transactions
`/transactions/new` SHALL accept the whitelisted query parameter `shared=1`. When present, the new draft SHALL start with sharing turned on. Any other value SHALL be ignored. Combined with `tab=sharing`, the view SHALL open on the Sharing tab.

#### Scenario: Start a shared transaction
- **WHEN** `/transactions/new?shared=1&tab=sharing` is opened
- **THEN** the Sharing tab is shown with sharing on and nothing is created until Save

### Requirement: Origin-aware back arrow
The transaction record view's back arrow SHALL return to the in-app view that opened it, when that view passes its path as navigation state. The path SHALL be accepted only when it is an app-relative path starting with a single `/`. In every other case the back arrow SHALL navigate to `/transactions`. The origin SHALL be kept when saving a new transaction navigates to its stored record view.

#### Scenario: Opened from a shared expense
- **WHEN** the owner opens a transaction through "Manage participants" on a shared expense and activates the back arrow
- **THEN** the shared expense record view opens

#### Scenario: Opened directly
- **WHEN** a transaction is opened from the Transactions list or a typed URL
- **THEN** the back arrow navigates to `/transactions`
