# authenticated-root-routing Specification

## Purpose
Defines what visitors see at the site root, so signed-in users go straight to their dashboard and everyone else gets the public landing page, without redirect loops or credential handling in the gateway.

## Requirements

### Requirement: The root shows the right experience

A request for `/` with the session-presence cookie SHALL be served by the application, whose root is the dashboard. A request without it SHALL be served the landing page at the same URL. The gateway SHALL NOT read or validate any credential to choose between them.

#### Scenario: Signed-in visitor
- **WHEN** a user with a valid session opens `/`
- **THEN** the dashboard renders with no redirect through the landing page and no login prompt

#### Scenario: Signed-out visitor
- **WHEN** a visitor with no presence cookie opens `/`
- **THEN** the landing page renders and the URL stays `/`

#### Scenario: Similar cookie name
- **WHEN** a request carries only a cookie whose name merely begins with the presence cookie's name
- **THEN** it is treated as signed out

#### Scenario: Presence cookie for a session that has ended
- **WHEN** a visitor has a presence cookie but their session was revoked
- **THEN** the application redirects once to login, the presence cookie is cleared, and the next visit to `/` shows the landing page with no loop

### Requirement: The root is not cached across session states

Responses for `/` SHALL NOT be stored by shared or browser caches in a way that shows one session state's page to another. Landing and app assets MAY remain cacheable.

#### Scenario: Sign in, then return to the root
- **WHEN** a visitor signs in and opens `/` again
- **THEN** the dashboard renders rather than a cached landing page

#### Scenario: Sign out, then return to the root
- **WHEN** a user signs out and opens `/` again
- **THEN** the landing page renders rather than a cached app shell

#### Scenario: Response headers
- **WHEN** the gateway answers a request for `/`
- **THEN** the response includes `Cache-Control: private, no-store` and `Vary: Cookie`

### Requirement: Sessions restore smoothly across browsers

Opening the root or the installed app SHALL restore an existing session with no login prompt or visible flash of the login form, on desktop browsers, mobile Safari, mobile Chrome, and Home Screen installs.

#### Scenario: Reopening a browser
- **WHEN** a user with a persistent session reopens the browser at `/`
- **THEN** the dashboard renders after session restore, with no login form shown

#### Scenario: Installed app
- **WHEN** a user with a persistent session opens the installed app, which starts at `/login`
- **THEN** the user reaches the dashboard without the login form

#### Scenario: Session issued before the presence cookie existed
- **WHEN** a valid session has no presence cookie yet, and the user opens `/`
- **THEN** they see the landing page once, and "Log in" enters the app with no credentials and sets the cookie for future visits
