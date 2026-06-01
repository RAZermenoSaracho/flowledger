-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "SettlementRequest" (
    "id" TEXT NOT NULL,
    "sharedExpenseParticipantId" TEXT NOT NULL,
    "debtorUserId" TEXT NOT NULL,
    "creditorUserId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "SettlementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SettlementRequest_sharedExpenseParticipantId_idx" ON "SettlementRequest"("sharedExpenseParticipantId");

-- CreateIndex
CREATE INDEX "SettlementRequest_debtorUserId_idx" ON "SettlementRequest"("debtorUserId");

-- CreateIndex
CREATE INDEX "SettlementRequest_creditorUserId_idx" ON "SettlementRequest"("creditorUserId");

-- CreateIndex
CREATE INDEX "SettlementRequest_status_idx" ON "SettlementRequest"("status");

-- AddForeignKey
ALTER TABLE "SettlementRequest" ADD CONSTRAINT "SettlementRequest_sharedExpenseParticipantId_fkey" FOREIGN KEY ("sharedExpenseParticipantId") REFERENCES "SharedExpenseParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRequest" ADD CONSTRAINT "SettlementRequest_debtorUserId_fkey" FOREIGN KEY ("debtorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRequest" ADD CONSTRAINT "SettlementRequest_creditorUserId_fkey" FOREIGN KEY ("creditorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
