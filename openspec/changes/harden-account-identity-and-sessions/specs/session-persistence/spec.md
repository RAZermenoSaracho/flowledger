# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
