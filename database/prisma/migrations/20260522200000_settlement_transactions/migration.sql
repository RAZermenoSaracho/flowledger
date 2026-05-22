ALTER TABLE "SettlementRequest"
ADD COLUMN "paymentInfo" TEXT,
ADD COLUMN "debtorAccountId" TEXT,
ADD COLUMN "debtorCategoryId" TEXT,
ADD COLUMN "debtorTransactionId" TEXT,
ADD COLUMN "creditorTransactionId" TEXT;

CREATE UNIQUE INDEX "SettlementRequest_debtorTransactionId_key" ON "SettlementRequest"("debtorTransactionId");
CREATE UNIQUE INDEX "SettlementRequest_creditorTransactionId_key" ON "SettlementRequest"("creditorTransactionId");
CREATE INDEX "SettlementRequest_debtorAccountId_idx" ON "SettlementRequest"("debtorAccountId");
CREATE INDEX "SettlementRequest_debtorCategoryId_idx" ON "SettlementRequest"("debtorCategoryId");

ALTER TABLE "SettlementRequest"
ADD CONSTRAINT "SettlementRequest_debtorTransactionId_fkey"
FOREIGN KEY ("debtorTransactionId") REFERENCES "Transaction"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SettlementRequest"
ADD CONSTRAINT "SettlementRequest_creditorTransactionId_fkey"
FOREIGN KEY ("creditorTransactionId") REFERENCES "Transaction"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
