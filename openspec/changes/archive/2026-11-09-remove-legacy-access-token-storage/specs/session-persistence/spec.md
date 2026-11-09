# Spec Delta

## ADDED Requirements

### Requirement: Access token is never persisted in browser storage
The web app SHALL hold the access token only in memory, never in `localStorage` or `sessionStorage`. On each load, it SHALL remove the legacy `flowledger.token` entry that earlier versions stored in `localStorage`. A session SHALL be restored only through the HttpOnly refresh cookie.

#### Scenario: Legacy stored token is removed on load
- **WHEN** a browser that holds `flowledger.token` in `localStorage` loads the app
- **THEN** the entry is removed, and the session is restored from the refresh cookie exactly as it is without the entry

#### Scenario: Unavailable storage does not block the app
- **WHEN** access to `localStorage` throws, for example because site data is blocked
- **THEN** the app still loads and restores the session

#### Scenario: Signing in stores no token
- **WHEN** a user signs in, renews the session, or reloads the page
- **THEN** no access token is written to `localStorage` or `sessionStorage`
