# Design

## Context

See `proposal.md`. Ownership is enforced in Prisma queries and has held up in review. `publicTransactionSelect` already defines what a debt counterpart may see. Integration tests use supertest and a real Postgres through testcontainers.

## Goals / Non-Goals

**Goals:** turn the reviewed behavior into tests that fail if it breaks, and close the two small exposure gaps.

**Non-Goals:** see `proposal.md`.

## Security invariants

1. Every query for user-owned data includes the caller in its `where`, directly or through a relation.
2. A record the caller can't access is indistinguishable from one that doesn't exist.
3. Participants get only the public transaction selection.
4. A new mount under `app.ts` that handles user data must appear in the isolation suite.

## Decisions

### D1. Tests as the central guarantee, not a new authorization layer

One table-driven integration suite signs in two synthetic users, seeds records for one, and asserts the other's denial for each route family. A second table asserts 401 for anonymous requests on each protected mount. A policy layer would add a second place to express rules that queries already enforce.

*Alternative:* walking Express's router stack to find every route automatically. It depends on Express internals, and it would still need per-route fixtures. A plain table is more readable, and invariant 4 is enforced in review.

### D2. Reuse `publicTransactionSelect`

Pick the selection by comparing the caller with `ownerUserId`. In list reads, split the result by owner or apply the select per query. Confirm the shape against `useDebtSettlementWorkflow.ts`'s use of `categoryId`, which comes through debts, not this path, and against shared-expense pages. Add any field the UI genuinely needs to a participant-specific selection, not to the owner's view.

### D3. Align search limits in the shared schema

Reuse the `/v1` values, so one schema serves both paths where possible, and show a "type at least 3 characters" hint in web search inputs.

## Risks / Trade-offs

- [Participant UI relies on an omitted field] → Task 1.2 checks each consumer and adds a test; omitted fields appear as a compile error in the web type when the response type narrows.
- [The isolation suite gets slow] → It runs once per suite against one container, and only the integration tier needs Docker.
- [Static review missed a route] → The suite covers route families rather than proving completeness. Datasieve internals and a few group helpers were reviewed only in part, and scenarios in this suite exercise them end to end.

## Migration Plan

**Deployment order:** after `fix-access-token-purpose-validation`. No dependency on the other changes.

Merge and deploy through the existing workflow. There is no schema or environment change.

**Compatibility:** API credential paths don't change. Web clients ship in the same deploy. Short searches now get 400, which the web inputs avoid.

**Rollback:** revert and deploy. No data changes.
