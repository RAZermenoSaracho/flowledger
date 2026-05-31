ALTER TABLE "SettlementRequest"
ADD COLUMN "creditorAccountId" TEXT,
ADD COLUMN "creditorCategoryId" TEXT;

CREATE INDEX "SettlementRequest_creditorAccountId_idx" ON "SettlementRequest"("creditorAccountId");
CREATE INDEX "SettlementRequest_creditorCategoryId_idx" ON "SettlementRequest"("creditorCategoryId");

CREATE UNIQUE INDEX "SettlementRequest_pending_direction_unique"
ON "SettlementRequest"("sharedExpenseParticipantId", "debtorUserId", "creditorUserId")
WHERE "status" = 'pending';
