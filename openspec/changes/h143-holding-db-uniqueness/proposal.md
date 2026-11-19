# Proposal

## Why

Odoo task #143. The `account-holdings` spec already says an account holds each unlinked `(kind, code)` once, but the database does not enforce it.

B-010 changed the `Holding` unique key from `(accountId, kind, code)` to `(accountId, kind, code, exchange)`. Postgres treats NULLs as distinct, and `exchange` is NULL for every crypto, cash and unlinked stock/ETF holding. So for those holdings the only guard is a `findFirst` pre-check inside `applyHoldingChanges`. Under READ COMMITTED, two concurrent change sets can both pass the check and both insert, which leaves duplicate holdings in one account. The same account's value would then count the instrument twice.

This is a concurrent duplicate-create race, not an unlinking or foreign-key problem:
- `exchange` is immutable after creation, so no path unlinks a holding.
- Holdings are hard-deleted; there is no soft-delete.
- `accountId` and `userId` are real foreign keys.

## What Changes

- **Migration (additive, one index):** a partial unique index `Holding_accountId_kind_code_unlinked_key` on `("accountId", "kind", "code") WHERE "exchange" IS NULL`.
  - It is raw SQL inside a normal Prisma migration, because Prisma 6 cannot express partial indexes.
  - Rows with a NULL code (`other` holdings) still never conflict.
  - The existing key keeps covering linked listings.
- **API/MCP:** no new code path. The service already maps Prisma `P2002` to the domain duplicate 400, which REST, `/v1` and the MCP `update_holdings` tool share. The pre-check stays for early feedback; only its documentation changes.
- **Tests:** a DB-backed integration suite races real concurrent requests and checks the identity rules that must stay allowed.

**Not changing:** holding identity semantics, valuation, net worth, transactions, the Prisma schema, or any existing row. Nothing is deployed to production.
