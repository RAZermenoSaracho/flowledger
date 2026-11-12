# Proposal

## Why

Existing transactions cannot be shared from the app, and the sharing that exists is unsafe and non-consensual: `PUT /shared-expenses/:id` deletes and recreates participants (wiping paid state, trusting client `paidAmount`/status), deletes cascade over payments, a share is a debt the moment it is created, and users are discoverable and displayed by email. B-004 fixes this as one coherent slice: sharing editable in the Transaction Form View, participants who must accept, users who can block, and a public username identity that never exposes email or phone.

## What Changes

- **Sharing on existing transactions** in ST-007's Sharing tab: enable, pick participants, allocate, edit, add/remove participants, disable when safe, all inside the same draft and one atomic `PUT /transactions/:id` carrying `sharedExpense`. Settlement-sensitive guards apply on every entry point, including `PUT /shared-expenses/:id` (re-pointed at the same tx helper) and `DELETE /transactions/:id`. A second conversion returns a friendly 409.
- **Consent**: `SharedExpenseParticipant.acceptance` (`proposed | accepted | rejected`). Only the participant responds; only accepted shares count; material changes re-propose; the owner cannot override a rejection; manual participants are always accepted. New notifications with dedup. Participant UI in Debts "awaiting acceptance" and on the notification target.
- **Blocking**: `UserBlock`, three endpoints, effects on invites, notifications, search and proposed shares; Profile "Blocked users" tab and "Reject and block".
- **Public identity**: unique lowercase `username` (generated at both signup paths, backfilled), `identityVisibility`, one `toPublicUser`/`publicUserSelect` shape on every cross-user surface, username-only discovery, universal sharing to any non-blocked app user (KNOWN_ISSUES #019 is intentional), `/v1` and MCP parity.
- **One Prisma migration** (owns B-004's only one): username, `IdentityVisibility`, `UserBlock`, `ShareAcceptance`, new `NotificationType` values, with data backfill SQL that needs owner approval before apply.
- Modified specs: `financial-data-isolation`, `public-rest-api`, `mcp-group-tools`, `mcp-personal-tools`, `account-identity`. `profile-identity-layout` is not modified; Profile requirements live in the new specs.

**Depends on** `st007-transaction-form-view` (shell, Details/Related tabs, create-time sharing, `sharedExpense` field shape, #017) and `st005-reusable-editable-form-view` (`useFormDraft`, `FormView`, `EditableField`, `RelatedList`, Profile draft). Fourth in the single B-004 PR to `razs_ai` (ST-005, ST-006, ST-007, ST-003, ST-024, ST-008). ST-024 and ST-008 consume the identity shape and the accepted-only counting rule.

## Capabilities

### New Capabilities
- `transaction-sharing-conversion`: convert, edit, disable shared state on existing transactions; settlement guards.
- `shared-expense-consent`: participant acceptance, counting, re-proposal, notifications.
- `user-blocking`: block model, effects, Profile tab.
- `public-user-identity`: usernames, visibility, public shape, discovery, universal sharing, parity.

### Modified Capabilities
- `financial-data-isolation`, `public-rest-api`, `mcp-group-tools`, `mcp-personal-tools`, `account-identity`.

## Impact

- DB: one migration in `database/prisma/` (approval-gated backfill).
- Shared: username schema and reserved list, acceptance/visibility/block schemas, `sharedExpense` update shape, public user type.
- API: `users`, `auth`, `auth/providers/google`, `shared-expenses`, `transactions` (update/delete), `debts`, `groups`, `notifications`, `v1`, `mcp`.
- Web: Transaction Sharing tab, Debts awaiting-acceptance list, notification target, Profile General (username, visibility) and Blocked users tab; email rendering removed.
- Docs: `docs/DOMAIN_LOGIC.md`, `docs/PUBLIC_API.md`, KNOWN_ISSUES #037 (email-exposure part only).
