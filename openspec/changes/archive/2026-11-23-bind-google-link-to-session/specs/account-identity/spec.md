## MODIFIED Requirements

### Requirement: Linking Google requires the signed-in account

A user SHALL link a Google identity only from an authenticated session, through a flow bound to that user. The link SHALL be created only on a request that carries a valid access token for the same user who started the link. A valid OAuth state and nonce alone SHALL NOT create a link. Linking SHALL NOT issue or replace a session. A Google identity already linked to another account SHALL be refused.

#### Scenario: Successful link
- **WHEN** a signed-in user connects Google from Profile and completes consent in the same signed-in browser
- **THEN** the identity is linked to that user, the existing session continues, and Profile shows Google as connected

#### Scenario: Identity already linked elsewhere
- **WHEN** the chosen Google identity is linked to a different account
- **THEN** no link changes and Profile reports the conflict without naming the other account

#### Scenario: Unauthenticated start
- **WHEN** the link flow is started without a valid access token
- **THEN** the response is 401

#### Scenario: Callback without a session
- **WHEN** a link callback with a valid state and nonce finishes in a browser with no signed-in session
- **THEN** no link is created

#### Scenario: Different user's session
- **WHEN** a pending link started by one user is completed with another user's access token
- **THEN** the response is a generic error, no link is created, and the pending link is discarded

#### Scenario: Missing or expired pending link
- **WHEN** link completion is requested without a valid, unexpired pending link
- **THEN** the response is a generic error and no link is created

#### Scenario: Sign-in unaffected
- **WHEN** a user signs in or registers with Google outside the link flow
- **THEN** the callback behaves as before and issues the session directly
