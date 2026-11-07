# Spec Delta

## Purpose

Defines how sign-in methods attach to accounts, how an account's email changes, and how authentication endpoints resist abuse, so that proving control of an address never grants entry to an account someone else may already control.

## ADDED Requirements

### Requirement: Google sign-in never links by email alone

Google sign-in SHALL enter an account only through an existing link to that Google identity, or by creating a new account when no account has the email. If an unlinked account already has the email, in any letter case, sign-in SHALL be refused without creating a link or a session.

#### Scenario: Returning linked user
- **WHEN** a Google identity already linked to an account signs in
- **THEN** the user enters that account, even if the account's email has since changed

#### Scenario: New user
- **WHEN** a verified Google identity signs in and no account has its email
- **THEN** a new account and link are created and the user is signed in

#### Scenario: Email matches an unlinked account
- **WHEN** a Google identity signs in and an unlinked account has the same email
- **THEN** no link or session is created, and the login page says to sign in with the existing method and connect Google from Profile

#### Scenario: Existing links keep working
- **WHEN** an account linked before this requirement signs in with Google
- **THEN** sign-in continues to work

### Requirement: Linking Google requires the signed-in account

A user SHALL link a Google identity only from an authenticated session, through a flow bound to that user. Linking SHALL NOT issue or replace a session. A Google identity already linked to another account SHALL be refused.

#### Scenario: Successful link
- **WHEN** a signed-in user connects Google from Profile and completes consent
- **THEN** the identity is linked to that user, the existing session continues, and Profile shows Google as connected

#### Scenario: Identity already linked elsewhere
- **WHEN** the chosen Google identity is linked to a different account
- **THEN** no link changes and Profile reports the conflict without naming the other account

#### Scenario: Unauthenticated start
- **WHEN** the link flow is started without a valid access token
- **THEN** the response is 401

### Requirement: Email changes require re-authentication

Changing an account's email SHALL require the current password, and SHALL atomically update the email and revoke all of the user's other refresh tokens. Other profile updates SHALL NOT change email. Accounts without a password SHALL NOT change email. An API credential SHALL NOT change email.

#### Scenario: Correct password
- **WHEN** a user submits a new available email and the correct current password
- **THEN** the email changes, the current device stays signed in, and other devices' refresh returns 401

#### Scenario: Wrong password
- **WHEN** the current password is wrong
- **THEN** the response is 400, and the email and all sessions stay unchanged

#### Scenario: Email already registered
- **WHEN** the new email belongs to another account
- **THEN** the response is 409 and nothing changes

#### Scenario: Password-less account
- **WHEN** an account with no password requests an email change
- **THEN** the response is 400 and nothing changes

#### Scenario: Profile update with a different email
- **WHEN** the general profile update receives an email different from the current one
- **THEN** the response is 400 and nothing changes

### Requirement: Authentication endpoints are rate limited

Login, registration, refresh, password change, and email change SHALL reject excess attempts with 429 and a JSON message. One source repeatedly failing against one email SHALL NOT lock that account for other sources.

#### Scenario: Repeated failed logins
- **WHEN** one source exceeds 10 failed logins for one email within 15 minutes
- **THEN** further attempts for that pair return 429 until the window ends

#### Scenario: Different source during an attack
- **WHEN** one source is limited for an email
- **THEN** the correct password from another source still signs in

#### Scenario: Refresh limited
- **WHEN** refresh returns 429
- **THEN** the client keeps the session and retries later, because only a 401 ends a session

### Requirement: Session routes reject foreign origins

Browser requests to session-changing `/auth` routes with an `Origin` other than the configured web app SHALL be rejected with 403 before the session changes. Requests with no `Origin` SHALL be processed normally.

#### Scenario: Sibling origin
- **WHEN** a same-site sibling application posts to refresh or logout with credentials
- **THEN** the response is 403 and the token is neither rotated nor revoked

#### Scenario: The web app
- **WHEN** the configured web app posts to these routes
- **THEN** the request proceeds

### Requirement: Login does not reveal registered emails by timing

Login SHALL do equivalent password-hashing work whether or not the email exists or the account has a password, and SHALL return the same 401 message.

#### Scenario: Unknown email
- **WHEN** login is attempted for an unknown email or a password-less account
- **THEN** a password hash comparison is still performed, and the response matches a wrong-password response
