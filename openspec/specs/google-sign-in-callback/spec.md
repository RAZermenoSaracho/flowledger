# google-sign-in-callback Specification

## Purpose
Defines how Google sign-in returns to the web app using the existing session cookie, so that no access or refresh token ever appears in a URL, browser history, or log.

## Requirements

### Requirement: No credential in callback URLs

The Google callback redirect SHALL NOT contain an access token, refresh token, or other credential in its query or fragment. The post-login destination MAY be included and SHALL still be validated as an in-app path.

#### Scenario: Successful sign-in redirect
- **WHEN** Google sign-in succeeds
- **THEN** the redirect to the web app contains no token, and the response sets the session cookies

#### Scenario: Unsafe destination
- **WHEN** the destination is not a same-origin path
- **THEN** the user goes to the dashboard

### Requirement: Callback completes through session restore

The callback page SHALL get its access token only through the app's normal session restore, and navigate exactly once to its destination. It SHALL distinguish a rejected session from a temporary failure.

#### Scenario: Session restored
- **WHEN** the callback page loads and session restore succeeds
- **THEN** the user reaches the destination, and the callback URL isn't left in browser history

#### Scenario: Session rejected
- **WHEN** session restore returns 401
- **THEN** the page shows a sign-in error with a link to login

#### Scenario: Temporary failure
- **WHEN** session restore fails with a network error or 5xx
- **THEN** the page shows the connection message, retries automatically, and continues on success

#### Scenario: Error leaves a clean URL
- **WHEN** the callback page shows an error
- **THEN** its fragment has been removed from the address bar

### Requirement: Google sign-in works across supported browsers

Google sign-in SHALL complete with no second prompt on desktop browsers, mobile Safari, mobile Chrome, and Home Screen installs, in both session modes.

#### Scenario: Mobile Safari
- **WHEN** a user signs in with Google in mobile Safari
- **THEN** the session is restored after the redirect and persists according to the chosen mode

#### Scenario: Installed Home Screen app
- **WHEN** a user starts Google sign-in from an installed app
- **THEN** sign-in completes in the installed app, or the app shows a clear next step when the operating system keeps the cookie outside it, and the user is never left on a blank page

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
