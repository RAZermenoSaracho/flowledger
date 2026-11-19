-- Postgres treats NULLs as distinct, so "Holding_accountId_kind_code_exchange_key" never rejects two holdings without an
-- exchange (crypto, cash and unlinked stock/ETF). This partial index enforces one such holding per (account, kind, code);
-- rows with a NULL code (other assets) still never conflict. Prisma's schema language cannot express a partial index, so it
-- lives only here; `prisma migrate diff` leaves it alone. Fails without changing any row if duplicates already exist.
CREATE UNIQUE INDEX "Holding_accountId_kind_code_unlinked_key" ON "Holding"("accountId", "kind", "code") WHERE "exchange" IS NULL;
