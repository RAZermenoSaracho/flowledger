# session-persistence Specification

## Purpose
Defines how a web session persists on a device, survives transient failures, and ends through expiry, logout, or password change.

## Requirements

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

A refresh token SHALL stay usable until a token issued from it is used, and SHALL then be rejected. If a rejected token was revoked more than 60 seconds earlier, the server SHALL also revoke every token issued from it, directly or indirectly.

#### Scenario: Response lost
- **WHEN** the server rotates a token but the client never receives the response, and the client later presents the old token
- **THEN** the refresh succeeds and the session continues

#### Scenario: Concurrent refresh
- **WHEN** two tabs present the same token at once
- **THEN** both refreshes succeed

#### Scenario: Superseded token
- **WHEN** a token issued from a previous token has been used, and the previous token is presented again
- **THEN** the refresh returns 401

#### Scenario: Replay after the grace period
- **WHEN** a token revoked more than 60 seconds ago is presented again
- **THEN** the refresh returns 401, and every token descended from it also returns 401 on refresh

#### Scenario: Request racing a rotation
- **WHEN** a token revoked less than 60 seconds ago is presented, as a request in flight during a rotation can do
- **THEN** the refresh returns 401, and tokens descended from it remain valid

#### Scenario: Other devices during a replay
- **WHEN** a replay revokes one session's descendants
- **THEN** the user's other sessions can still refresh

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

A signed-in user who opens the login page SHALL go to the requested destination without entering credentials. The API SHALL set a non-secret session-presence cookie readable on `/` so the landing gateway can route to the app, and it SHALL have the same lifetime and be cleared with the session cookie. A rejected refresh SHALL clear the presence cookie and SHALL NOT clear the refresh cookie, and the next successful refresh SHALL set the presence cookie again.

#### Scenario: Login page with a valid session
- **WHEN** a user with a valid refresh cookie opens `/login`
- **THEN** the session is restored and the user is redirected without seeing the form

#### Scenario: Presence cookie carries no credential
- **WHEN** the API issues or rotates a session
- **THEN** the presence cookie has a fixed non-secret value, `Path=/`, and `SameSite=Lax`, and never contains token data

#### Scenario: Rejected refresh
- **WHEN** the refresh endpoint returns 401
- **THEN** the response expires the presence cookie and leaves the refresh cookie unchanged

#### Scenario: Rejected refresh racing a valid rotation
- **WHEN** a stale tab's refresh is rejected just after another tab rotated successfully
- **THEN** the valid refresh cookie is untouched, and the presence cookie returns on the next successful refresh

### Requirement: Environment isolation

Non-production environments SHALL use different session cookie names from production, so that a browser using both keeps each session intact. Production cookie names SHALL NOT change.

#### Scenario: Using dev and production in one browser
- **WHEN** a user signs in or logs out on the dev environment
- **THEN** the production session cookie is neither overwritten nor cleared

### Requirement: Refresh cookie is limited to the API host

The refresh-token cookie SHALL be host-only on the API host. The presence cookie SHALL keep its configured domain, and SHALL stay free of credentials. Browsers holding the older domain-scoped refresh cookie SHALL have it cleared without being signed out.

#### Scenario: New or rotated session
- **WHEN** the API sets a refresh cookie
- **THEN** the cookie has no `Domain` attribute, and it keeps `HttpOnly`, `SameSite=Strict`, `Path=/auth`, and `Secure` in production

#### Scenario: Browser with the older cookie
- **WHEN** a browser holding the domain-scoped refresh cookie refreshes
- **THEN** the session continues, the response expires the domain-scoped cookie, and the next refresh presents only the host-only cookie

### Requirement: Failed logout is reported

If the logout request fails, the client SHALL tell the user that sign-out did not complete and SHALL keep them signed in, so they can retry. It SHALL NOT present the session as ended while the server token remains valid.

#### Scenario: Logout during a network failure
- **WHEN** the logout request fails with a network error or 5xx
- **THEN** the user sees that sign-out failed, stays in the app, and can try again

#### Scenario: Retry succeeds
- **WHEN** a later logout request succeeds
- **THEN** the session is revoked and the cookies are cleared

### Requirement: Expired refresh records are removed

Issuing a refresh token SHALL also delete that user's refresh records whose expiry has passed. A failure to delete SHALL NOT fail sign-in or refresh.

#### Scenario: Expired rows at refresh
- **WHEN** a user with expired refresh records signs in or refreshes
- **THEN** those records are gone and unexpired records remain

#### Scenario: Revoked but unexpired rows
- **WHEN** a revoked record has not expired
- **THEN** it remains, so a replay can still be recognized
