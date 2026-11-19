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
- **API/MCP:** a duplicate create (pre-check for linked and unlinked holdings, or a Prisma `P2002` from a lost race) returns `409 duplicate_holding`, which names the instrument, in the structured error format. REST, `/v1` and the MCP `update_holdings` tool share this behavior.
- **Web (follow-up from manual acceptance):** a duplicate listing picked from the security search failed validation without showing its error. Save went disabled with only a hover reason, so the page looked stuck on "Updates on Save". Now:
  - the row shows the duplicate message inline;
  - a blocked save shows "Fix the highlighted fields to save";
  - a server `409` lands on the conflicting row, with the draft kept.
- **Tests:** a DB-backed integration suite races real concurrent requests and checks the identity rules that must stay allowed.

**Not changing:** holding identity semantics, valuation, net worth, transactions, the Prisma schema, or any existing row. Nothing is deployed to production.
