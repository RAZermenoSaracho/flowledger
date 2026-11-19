# Design

## Root cause

`applyHoldingChanges` (`apps/api/src/modules/accounts/services/holdings.update.service.ts`) is the only writer of `Holding`; REST, `/v1` and MCP all call it. For a create without `exchange` it runs `findFirst({ accountId, userId, kind, code, exchange: null })` and then `create`, inside an interactive transaction at READ COMMITTED.

Neither transaction can see the other's uncommitted insert, so both pass the check. The unique key `(accountId, kind, code, exchange)` does not stop the second insert because NULL `exchange` values are distinct. Linked listings (non-NULL `exchange`) were already safe.

## Identity rules (unchanged; now enforced)

| Holding | Identity | Database guard |
|---|---|---|
| Linked stock/ETF | account, kind, code, exchange | existing `Holding_accountId_kind_code_exchange_key` |
| Crypto, cash, unlinked stock/ETF | account, kind, code with `exchange IS NULL` | new partial unique index |
| Other | none (several allowed, even with the same name) | none: `code` is NULL |

- `code` and `exchange` are upper-cased by `holdingUpsertSchema`, and the service is the only writer, so a plain-column index is enough; no expression index is needed. Staging holds no lower-case values.
- `kind` is part of every key, so a `stock` and an `etf` with the same code stay distinct.
- A linked and an unlinked AAPL also stay distinct, as today.

## Decisions

- **D1: partial index instead of `NULLS NOT DISTINCT`.** `NULLS NOT DISTINCT` (PG 15+) on the existing key would also make `other` holdings, which have a NULL code, conflict with each other. A partial index `WHERE exchange IS NULL` is the smallest rule that matches the spec. It does not touch or duplicate the existing key.
- **D2: raw SQL in a migration.** Prisma 6 has no syntax for partial indexes, so the index exists only in `migration.sql`. Checked on a scratch database: `prisma migrate diff --from-url <db> --to-schema-datamodel` produced an empty migration, so later Prisma migrations will not drop it.
- **D3: no new application locking.** The database decides the race; the losing insert blocks until the winner commits and then fails with 23505. Prisma reports that as `P2002`, which the catch maps to the `409 duplicate_holding` (D4) and rolls back the whole change set. A process-local mutex would not help across PM2 processes. Updates cannot create a duplicate because `kind`, `code` and `exchange` are immutable.
- **D4: 409 `duplicate_holding`.** Sequential and racing duplicates both return `409`, using `conflict()` in `utils/httpError.ts`.
  - The body is `{ message, code, holding: { kind, code, exchange }, issues.fieldErrors["upsert.<i>.code"] }`.
  - After a `P2002`, the service reads which of the change set's creates the account now holds, so it names the right instrument.
  - The label uses the stored MIC (for example `AAPL (XNGS)`), because exchange display names are not stored.
- **D5: web feedback (acceptance follow-up).**
  - **Root cause:** `HoldingsTab` rendered the `code` error only for manual-code inputs. A new linked row, picked from the security search, had the error but never showed it. `FormView` disables Save on any field error, with a screen-reader-only reason.
  - **Inline errors:** the linked-row branch now renders the error. `validateHoldingRows` uses the account-level duplicate message when the duplicate matches a saved row.
  - **Blocked save:** `useFormDraft` sets a visible `saveError` ("Fix the highlighted fields to save") and clears it on the next edit.
  - **Server conflict:** `accounts.client.ts` turns a `409 duplicate_holding` into an `Error` carrying `duplicateHolding`. `useAccountForm` maps it to `holdings.<row>.code` through `duplicateHoldingRowIndex`, so the inline error lands on the right row and the draft is kept.

## Existing-data audit and remediation

The index build fails, and the migration is rolled back without changing rows, if duplicates exist. Audit query (read-only):

```sql
SELECT "accountId", kind, code, count(*) FROM "Holding"
WHERE exchange IS NULL AND code IS NOT NULL GROUP BY 1, 2, 3 HAVING count(*) > 1;
```

- **Staging (2026-11-18):** 5 holdings, 0 conflicting groups, 0 non-upper-case codes.
- **Production:** must be audited before promotion (not done in this change).

If duplicates exist, the owner decides per account which row to keep. Nothing is merged or deleted automatically.

## Deployment and rollback

- Staging: `prisma migrate deploy` through the normal staging workflow. Production is out of scope until approved.
- Rollback: `DROP INDEX "Holding_accountId_kind_code_unlinked_key";` in a new migration. This is metadata-only and loses no data; behavior returns to the application pre-check.
- The index is built without `CONCURRENTLY` because `migrate deploy` runs in a transaction; the `Holding` table is tiny, so the lock is brief.
