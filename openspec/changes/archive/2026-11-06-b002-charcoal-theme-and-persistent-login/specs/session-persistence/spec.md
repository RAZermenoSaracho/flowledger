# Spec Delta

## Purpose

Defines how a web session persists on a device, survives transient failures, and ends through expiry, logout, or password change.

## ADDED Requirements

### Requirement: Session choice at login

The login page SHALL offer a checked-by-default "Keep me logged in on this device" option that applies to email/password and Google sign-in. Registration SHALL create a persistent session.

#### Scenario: Option checked
- **WHEN** a user signs in with the option checked
- **THEN** the session cookie has a 30-day lifetime, and the session survives closing and reopening the browser or app

#### Scenario: Option unchecked
- **WHEN** a user signs in with the option unchecked
- **THEN** the cookie has no persistent lifetime, and the server rejects the session after 24 hours without a refresh

#### Scenario: Google sign-in
- **WHEN** a user continues with Google from the login page
- **THEN** the session follows the option's state when sign-in began

### Requirement: Session mode survives renewal

Each refresh SHALL renew the session's full lifetime and keep its mode. Sessions that existed before this feature SHALL be treated as persistent.

#### Scenario: Sliding renewal
- **WHEN** a session refreshes
- **THEN** its new expiry is a full period from that moment, in the same mode

#### Scenario: Existing session at rollout
- **WHEN** a session created before this change refreshes
- **THEN** it continues as a 30-day persistent session and the user is not signed out

### Requirement: Transient failures keep the session

Only a 401 from the refresh endpoint SHALL end a session on the client. Network errors and other error responses SHALL NOT sign the user out.

#### Scenario: Refresh fails mid-session
- **WHEN** an access token has expired and the refresh request fails with a network error or 5xx
- **THEN** the user stays signed in, the failed request reports an error, and a later request can refresh

#### Scenario: Refresh fails while opening the app
- **WHEN** the app opens on a protected page and the refresh request fails with a network error or 5xx
- **THEN** the app shows a connection message instead of the login page and retries automatically

#### Scenario: Recovery after a transient failure
- **WHEN** an automatic retry succeeds
- **THEN** the original page renders without a new login

#### Scenario: Session rejected
- **WHEN** the refresh endpoint returns 401
- **THEN** the user is signed out and sent to the login page

### Requirement: Lost refresh responses and concurrent refreshes

A refresh token SHALL stay usable until a token issued from it is used, and SHALL then be rejected.

#### Scenario: Response lost
- **WHEN** the server rotates a token but the client never receives the response, and the client later presents the old token
- **THEN** the refresh succeeds and the session continues

#### Scenario: Concurrent refresh
- **WHEN** two tabs present the same token at once
- **THEN** both refreshes succeed

#### Scenario: Superseded token
- **WHEN** a token issued from a previous token has been used, and the previous token is presented again
- **THEN** the refresh returns 401

### Requirement: Logout ends the session on the device

Logout SHALL revoke the presented token, its immediate predecessor, and any token issued from it, then clear the session cookies. It SHALL NOT affect sessions on other devices.

#### Scenario: Logout
- **WHEN** a user logs out
- **THEN** the current token and its predecessor return 401 on refresh, and both session cookies are cleared

#### Scenario: Refresh in flight during logout
- **WHEN** a refresh issues a new token from the presented token just as the user logs out
- **THEN** the new token returns 401 on refresh, even if its cookie arrives after the logout response

#### Scenario: Other devices unaffected
- **WHEN** a user logs out on one device
- **THEN** a session on another device can still refresh

### Requirement: Password change revokes other sessions

A successful password change SHALL revoke all of the user's refresh tokens except the one on the requesting device, in the same atomic operation as the password update. A failed attempt SHALL revoke nothing.

#### Scenario: Other device after a password change
- **WHEN** a user changes their password on device A
- **THEN** device B's refresh returns 401, and any access token it already holds expires within the access-token lifetime

#### Scenario: Current device stays signed in
- **WHEN** a user changes their password
- **THEN** the requesting device's session continues

#### Scenario: Wrong current password
- **WHEN** the current password is incorrect
- **THEN** the request returns 400, and the password and all sessions stay unchanged

### Requirement: Signed-in users are not asked to log in

A signed-in user who opens the login page SHALL go to the requested destination without entering credentials. The API SHALL set a non-secret session-presence cookie readable on `/` so the landing gateway can route to the app, and it SHALL have the same lifetime and be cleared with the session cookie.

#### Scenario: Login page with a valid session
- **WHEN** a user with a valid refresh cookie opens `/login`
- **THEN** the session is restored and the user is redirected without seeing the form

#### Scenario: Presence cookie carries no credential
- **WHEN** the API issues or rotates a session
- **THEN** the presence cookie has a fixed non-secret value, `Path=/`, and `SameSite=Lax`, and never contains token data

### Requirement: Environment isolation

Non-production environments SHALL use different session cookie names from production, so that a browser using both keeps each session intact. Production cookie names SHALL NOT change.

#### Scenario: Using dev and production in one browser
- **WHEN** a user signs in or logs out on the dev environment
- **THEN** the production session cookie is neither overwritten nor cleared
