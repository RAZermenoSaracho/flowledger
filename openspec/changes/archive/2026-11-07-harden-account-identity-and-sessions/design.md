# Design

## Context

See `proposal.md`. No mail-sending code exists in the API. Without verified email, the server cannot tell who owns an address, so linking must not depend on one. Topology, read from the host: Cloudflare to `cloudflared`, then directly to the API on port 4000, so `trust proxy: 1` gives the client address for IP-keyed limits. The process runs as one pm2 instance, so an in-memory limiter is accurate.

## Goals / Non-Goals

**Goals:** close the identity-merge path without mail infrastructure, and raise the cost of credential abuse and token theft.

**Non-Goals:** see `proposal.md`. No new tables, no new dependencies.

## Security invariants

1. A Google identity enters an account only through an existing link, or by creating a new account.
2. A link is created only for the user named by a signed-in flow, or for the new account created with it.
3. Changing the login email requires the current password and ends other sessions atomically.
4. The refresh token is only ever sent to the API host.
5. Superseded-token replay never extends a session.

## Decisions

### D1. Remove automatic linking instead of adding email verification first

Delete the find-by-email branch and refuse on a case-insensitive match. This closes the merge for both the unverified-registration and email-change variants with a net code reduction. Email verification would add a mail provider, templates, tokens, and a new user state.

**Known ceiling:** a squatter on an unverified address still blocks the real owner, who gets a refusal rather than entry. That is an availability cost rather than an account merge. It is acceptable for a small trusted group and logged until verification exists. A password user who forgot a password loses Google as an accidental recovery path; the link flow restores it only for users who connected in advance.

### D2. Explicit link through signed state

`POST /auth/google/link` sits behind `requireAuth` and returns the Google URL, with the existing signed state carrying `linkUserId`. It also sets the nonce cookie. The callback branches on that claim, creates the link only, and redirects to Profile. It reuses the state JWT, nonce cookie, and code exchange, with no new table.

### D3. Email change belongs under `/auth`

The refresh cookie is sent only under `/auth`, and revoking "other sessions" needs it to identify this device. `PATCH /auth/email` therefore reuses `updatePassword`'s pattern: one transaction, the same keep-this-device logic, and the same revoke-all fallback when no cookie is present. `updateProfile` rejects a differing email and otherwise ignores the field, so Profile's general save still works.

### D4. Rate limits reuse `createRateLimiter`

Add an optional key generator and a JSON message to the existing helper.

| Route | Key | Limit |
|---|---|---|
| `POST /auth/login` | IP plus SHA-256 of normalized email, counting failures only | 10 per 15 min |
| `POST /auth/login` | IP | 50 per 15 min |
| `POST /auth/register` | IP | 10 per hour |
| `POST /auth/refresh` | IP | 60 per min |
| `PATCH /auth/password`, `PATCH /auth/email` | User id, so a stolen refresh cookie can't mint more guesses | 10 per 15 min |

Keying on the pair avoids letting an attacker lock a victim out. It does not stop a distributed attack, which needs edge rules or a shared store if it is ever observed. Limits are starting values, set in one place and tuned from logs.

### D5. Replay detection walks existing links

Rejected-token handling walks `previousTokenId` forward and revokes descendants, using the current column and no migration. Starting after a 60-second grace period protects a request in flight during a rotation, which otherwise would sign out a real user. That matches the concern behind B-002. The walk needs an index on `previousTokenId` only if logs show it is slow; each user's unexpired rows are few once expired rows are deleted.

*Alternative:* a `familyId` column. Revocation would be one query, but it needs a migration and a backfill rule for no practical gain at this volume.

### D6. Host-only refresh cookie with a clearing cookie

Drop `Domain` from the refresh cookie, and on every session response also send an expired copy with the old `Domain`. That removes the old cookie quickly, so the browser can't hold two cookies of the same name. `REFRESH_TOKEN_COOKIE_DOMAIN` keeps its name and now drives the presence cookie and the clearing copy. Web and API origins are same-site, so `SameSite=Strict` still sends the cookie on the app's own fetch.

### D7. Origin check as small middleware

Mounted on `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/login`, `POST /auth/register`, `PATCH /auth/password`, and `PATCH /auth/email`. A mismatch returns 403, and an absent `Origin` passes, so server-side tools and tests keep working. Browsers always send `Origin` on these POST and PATCH requests. A sibling can still plant a cookie (`docs/KNOWN_ISSUES.md`), and only keeping siblings trustworthy addresses that.

## Risks / Trade-offs

- [A legitimate user is refused at Google sign-in] → The login message explains the fix, and the link flow is in the same change. Owner can check affected accounts with the read-only query in task 7.1.
- [Earlier auto-links may already be merged accounts] → They can't be distinguished automatically. Task 7.1 lists accounts with both a password and a Google link for the owner to review.
- [Host-only cookie breaks on one browser] → Task 7.3 covers Safari, Chrome, and installed Home Screen use. Safari may cap cookie lifetime when subdomains resolve to different IP ranges; check persistence there. Both hosts currently go through Cloudflare.
- [Rate limit hits many users behind one address] → Failure-only counting on the email pair and generous IP limits. Tune from logs.

## Migration Plan

**Deployment order:** after `fix-access-token-purpose-validation`. Before `route-authenticated-root-and-remove-oauth-url-token`, which edits the same Google controller, though either order merges with small effort.

Deploy web and API together through the existing `main` workflow; there is no schema or environment change.

**Compatibility:** existing sessions and links continue. Old domain-scoped cookies are cleared on next refresh.

**Rollback:** revert and deploy. Sessions survive, because older code reads the host-only cookie by the same name. Links made in the meantime remain valid. Reverting automatic linking reopens F-02, so roll back only for an outage.
