# Spec Delta

## MODIFIED Requirements

### Requirement: Authentication endpoints are rate limited

Login, registration, refresh, password change, and email change SHALL reject excess attempts with 429 and a JSON message. The user search and username availability endpoints SHALL be limited per authenticated user with 429 and a JSON message. One source repeatedly failing against one email SHALL NOT lock that account for other sources.

#### Scenario: Repeated failed logins
- **WHEN** one source exceeds 10 failed logins for one email within 15 minutes
- **THEN** further attempts for that pair return 429 until the window ends

#### Scenario: Different source during an attack
- **WHEN** one source is limited for an email
- **THEN** the correct password from another source still signs in

#### Scenario: Refresh limited
- **WHEN** refresh returns 429
- **THEN** the client keeps the session and retries later, because only a 401 ends a session

#### Scenario: Search and availability limited
- **WHEN** one user exceeds the search or username-availability limit
- **THEN** further calls return 429 and other users are unaffected
