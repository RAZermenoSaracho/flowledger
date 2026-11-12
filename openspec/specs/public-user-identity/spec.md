# public-user-identity Specification

## Purpose
Public usernames, optional nicknames and identity visibility, so users are found and shown without exposing email addresses.

## Requirements

### Requirement: Username rules

`User.username` SHALL be unique, stored trimmed and lowercased, 3 to 30 characters of `[a-z0-9._]`, starting and ending alphanumeric, with no consecutive dots, and not in the reserved list (admin, support, flowledger, api, root, me, settings, help, system, null, undefined). Validation SHALL use one shared Zod schema and constant in `packages/shared`. Uniqueness SHALL be case-insensitive.

#### Scenario: Invalid username
- **WHEN** a username has 2 characters, a leading dot, `..`, or is reserved
- **THEN** it is rejected with 400

#### Scenario: Case-insensitive uniqueness
- **WHEN** `Ana` is requested while `ana` exists
- **THEN** it is normalized to `ana` and rejected as taken (409)

### Requirement: Automatic username on signup

Both email/password signup and Google signup (inside `findOrCreateGoogleUser`'s transaction) SHALL assign a generated username (`user_` plus 12 random characters, not derived from email) through one shared helper that retries on a unique violation.

#### Scenario: Email signup
- **WHEN** a user registers by email
- **THEN** the account has a valid generated username

#### Scenario: Google signup
- **WHEN** a new user signs in with Google
- **THEN** the account has a valid generated username

#### Scenario: Generation collision
- **WHEN** the generated value collides
- **THEN** the helper retries and signup succeeds

### Requirement: Safe idempotent backfill

The migration SHALL add `username` nullable, assign a generated username to rows where it is null, then set NOT NULL and unique. Re-running the assignment SHALL change no row that already has a username. The backfill SQL SHALL be approved by the owner before being applied.

#### Scenario: Existing users
- **WHEN** the migration runs on a database with users
- **THEN** every user has a unique non-email-derived username and no other column changed

#### Scenario: Re-run
- **WHEN** the assignment statement runs again
- **THEN** zero rows change

### Requirement: Username change in Profile

The Profile General tab SHALL let the user edit `username` and `identityVisibility` as `EditableField`s in the Profile draft, saved through the existing own-profile update. `GET /users/username-availability?username=` SHALL require auth, be rate limited and be debounced in the UI. A concurrent claim SHALL resolve at the unique constraint: P2002 maps to 409 on the `username` field. Relationships SHALL remain on `User.id`, and the username SHALL never be used for authorization or as a credential.

#### Scenario: Available
- **WHEN** the user types an unused valid username
- **THEN** the field shows available and Save applies it

#### Scenario: Taken
- **WHEN** the username belongs to another user
- **THEN** the field shows taken and Save is disabled

#### Scenario: Concurrent change
- **WHEN** two users save the same free username at once
- **THEN** one succeeds and the other gets 409 on the `username` field with the draft kept

#### Scenario: Rename keeps relationships
- **WHEN** a user with shared expenses, debts, group memberships and blocks changes username
- **THEN** all of them remain attached and display the new username

#### Scenario: Availability rate limit
- **WHEN** a user exceeds the availability limit
- **THEN** the response is 429

### Requirement: Identity visibility modes

`User.identityVisibility` SHALL be `username_only` (default) or `username_and_name`. Visibility SHALL govern only private name exposure through `displayName`. Nickname SHALL always be public when set. Labels SHALL join present nickname and displayName with ` · ` and append ` (@username)`, or show `@username` alone, never an email fallback.

#### Scenario: Username only
- **WHEN** a user in the default mode appears to another user
- **THEN** `@username` is shown when nickname is absent and `displayName` is null

#### Scenario: Username and name
- **WHEN** a user with `username_and_name` and a name appears to another user
- **THEN** `Name (@username)` is shown

#### Scenario: Name missing
- **WHEN** the mode is `username_and_name` and the user has no name or nickname
- **THEN** `@username` is shown

### Requirement: Public identity shape on every cross-user surface

`toPublicUser` and `publicUserSelect` SHALL be the only way a user is serialized to another user, yielding `{ id, username, nickname, displayName }` with no email, phone, avatar or auth fields. They SHALL be applied to: users search, group members (web, `/v1`, MCP), debts counterparties and person balances, settlement requests, shared-expense owner and participants, and notification text created from now on. App-user participants SHALL render the live public label rather than the stored `participantName` snapshot; manual participants keep their owner-entered name. The web SHALL stop rendering emails and SHALL search debts by username.

#### Scenario: No email or phone via any surface
- **WHEN** a user views search results, group members, debts, settlements, shared expenses and notifications of another user, through web, `/v1` and MCP
- **THEN** no response contains that user's email or phone

#### Scenario: Live label
- **WHEN** an app-user participant changes nickname, username or visibility
- **THEN** shared expenses show the new label, while old notification text stays as stored

#### Scenario: Group member add response
- **WHEN** an admin adds a member
- **THEN** the response contains the public identity only

### Requirement: Username and nickname discovery

`GET /users/search?q=` (and its `/v1` and MCP twins) SHALL match exact username first, then case-insensitive username or nickname prefix, require at least 3 characters, return at most 10 results, never match on email or name, exclude the caller and any user blocked in either direction, and be rate limited per user with `createRateLimiter`.

#### Scenario: Exact then prefix
- **WHEN** `q=ana_1` matches `ana_1` exactly and `ana_10` by prefix
- **THEN** `ana_1` is listed first

#### Scenario: Email not searchable
- **WHEN** `q` matches only another user's private email or account name, without matching username or nickname
- **THEN** that user is not returned

#### Scenario: Limits
- **WHEN** `q` has fewer than 3 characters or more than 10 users match
- **THEN** the response is 400 or capped at 10 respectively

#### Scenario: Rate limited
- **WHEN** a user exceeds the search limit
- **THEN** the response is 429

### Requirement: Universal sharing

A shared expense SHALL accept any existing app user who is not blocked, plus manual participants, on group and non-group transactions alike; Group membership SHALL NOT be required. `/v1` and MCP SHALL apply the same rule and SHALL NOT reject non-group transactions.

#### Scenario: Non-group invitation
- **WHEN** an owner shares a personal transaction with a non-blocked user by username
- **THEN** a `proposed` share is created and the user is notified

#### Scenario: Group transaction, non-member
- **WHEN** an owner shares a group transaction with a user outside the group
- **THEN** the share is created as `proposed`

#### Scenario: Blocked user
- **WHEN** the participant has blocked the owner
- **THEN** the response is 400 "This user can't be invited."

#### Scenario: Parity
- **WHEN** the same sharing is performed through `/v1` and MCP
- **THEN** the rules, errors and results match the web

### Requirement: Non-member participants never see Group data

A participant who is not a Group member SHALL see only the shared expense and a transaction summary (amount, date, title, their share) and SHALL NOT see the Group, its members, categories or other transactions.

#### Scenario: Non-member views
- **WHEN** a non-member opens a shared expense on a group transaction
- **THEN** no group name, member list or category is returned and group routes return 404

### Requirement: Own-profile endpoints keep private fields

`/auth/me`, `GET /v1/me` and MCP `get_profile` SHALL continue to return the owner's private fields (including email) to that owner only, plus `nickname`, `username` and `identityVisibility`.

#### Scenario: Owner reads own profile
- **WHEN** a user reads their own profile
- **THEN** email, nickname, username and visibility are returned

#### Scenario: Other user
- **WHEN** another user is serialized elsewhere
- **THEN** the private fields are absent

### Requirement: Optional public nickname

`User.nickname` SHALL be nullable, non-unique, trimmed and 1–40 characters when set. Blank input SHALL clear it to null. Shared Zod validation SHALL reject control characters and a leading `@`. Profile SHALL edit it through an EditableField and explain that it is public, searchable, optional and not unique. Username SHALL always appear alongside nickname. No existing user SHALL be backfilled. `/v1 PATCH /me` and MCP `update_preferences` SHALL remain unchanged.

#### Scenario: Nickname with private name
- **WHEN** a user with nickname Sunny and username ana uses username_only visibility
- **THEN** the public label is `Sunny (@ana)` and displayName is null

#### Scenario: Nickname with visible name
- **WHEN** that user shares the name Ana
- **THEN** the label is `Sunny · Ana (@ana)`

#### Scenario: Clear nickname
- **WHEN** the owner saves blank nickname or null
- **THEN** nickname is null and the label uses only the remaining visible parts

#### Scenario: Duplicate nickname discovery
- **WHEN** multiple unblocked users share nickname Sunny and the query is sunny
- **THEN** all matching usernames remain distinct, exact username first and remaining users ordered by username within the limit

#### Scenario: Separate query normalization
- **WHEN** the query is @ana
- **THEN** username matching uses ana and nickname matching uses the trimmed raw @ana

#### Scenario: Nickname privacy and blocks
- **WHEN** nickname matches but the user is self or blocked in either direction
- **THEN** that user is excluded and private name and email are never searched
