# Spec Delta

## Purpose

Defines how Google sign-in returns to the web app using the existing session cookie, so that no access or refresh token ever appears in a URL, browser history, or log.

## ADDED Requirements

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
