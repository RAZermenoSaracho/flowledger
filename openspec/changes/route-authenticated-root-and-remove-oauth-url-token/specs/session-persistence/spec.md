# Spec Delta

## MODIFIED Requirements

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
