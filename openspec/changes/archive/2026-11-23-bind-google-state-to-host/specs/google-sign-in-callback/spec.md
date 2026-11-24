## ADDED Requirements

### Requirement: Sign-in nonce cookie cannot be planted from another subdomain

On HTTPS deployments, the Google OAuth nonce cookie SHALL be a host-locked cookie that no other subdomain can set, and the callback SHALL accept the nonce only from that cookie. A cookie with the legacy unprefixed name SHALL be ignored on those deployments. The callback SHALL NOT create a session or a pending link unless the nonce cookie set by the API host for the same browser matches the state nonce. Plain-HTTP local development MAY use an unprefixed cookie.

#### Scenario: Planted nonce cookie
- **WHEN** a callback with a valid state arrives in a browser whose only nonce cookie was planted from another subdomain under the unprefixed name
- **THEN** the callback is rejected, redirects to login with a generic error, and sets no session cookie

#### Scenario: Legitimate sign-in
- **WHEN** a user starts Google sign-in and the callback returns in the same browser
- **THEN** the host-locked nonce cookie matches the state and sign-in completes as before

#### Scenario: Cookie cleared after callback
- **WHEN** the callback finishes, successfully or not
- **THEN** the response expires the nonce cookie under the same name and attributes

#### Scenario: Local HTTP development
- **WHEN** the API runs over `http://localhost`
- **THEN** the nonce cookie uses the unprefixed name and sign-in works
