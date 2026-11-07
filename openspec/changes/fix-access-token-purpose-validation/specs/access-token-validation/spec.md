# Spec Delta

## Purpose

Defines which tokens may authenticate a web API request, so that a token issued for any other purpose, or one that identifies no user, can never reach a protected operation.

## ADDED Requirements

### Requirement: Only access tokens authenticate web API requests

A protected web API route SHALL accept a bearer token only when it is a correctly signed, unexpired access token issued for the access-token purpose and using the expected signing algorithm. Every other token SHALL receive a 401 before any route logic runs.

#### Scenario: Valid access token
- **WHEN** a request presents an unexpired access token issued at login, registration, refresh, or Google sign-in
- **THEN** the request proceeds as that token's user

#### Scenario: Token issued for another purpose
- **WHEN** a request presents a correctly signed Google state token or OAuth consent token
- **THEN** the response is 401 and no user data is read or changed

#### Scenario: Correctly signed token with no audience
- **WHEN** a request presents a correctly signed token that has no audience, including an access token issued before this requirement
- **THEN** the response is 401

#### Scenario: Unexpected signing algorithm
- **WHEN** a token is signed with any algorithm other than the expected one, including `none`
- **THEN** the response is 401

### Requirement: An authenticated request always identifies one user

Authentication SHALL succeed only when the token names a non-empty string subject and a string email. No protected route SHALL run with an undefined or empty user identity.

#### Scenario: Missing subject
- **WHEN** an otherwise valid access token has no subject
- **THEN** the response is 401

#### Scenario: Non-string or empty subject
- **WHEN** an otherwise valid access token has an empty or non-string subject
- **THEN** the response is 401

#### Scenario: Missing email
- **WHEN** an otherwise valid access token has no email claim
- **THEN** the response is 401

### Requirement: Other token purposes stay separate

Google state and OAuth consent verification SHALL accept only tokens of their own purpose and signing algorithm. An access token SHALL NOT be accepted by either.

#### Scenario: Access token used as Google state
- **WHEN** the Google callback receives an access token as `state`
- **THEN** sign-in fails with the existing invalid-state redirect

#### Scenario: Access token used as a consent request
- **WHEN** the consent endpoints receive an access token as the signed request
- **THEN** the request is rejected as invalid

### Requirement: Existing sessions survive token validation changes

Tightening access-token validation SHALL NOT sign out users who hold a valid refresh session.

#### Scenario: Access token issued before deployment
- **WHEN** a signed-in web client sends an access token issued before deployment
- **THEN** the client silently refreshes, retries the request, and the user stays signed in
