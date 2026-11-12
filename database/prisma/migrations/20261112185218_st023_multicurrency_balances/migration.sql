-- CreateEnum
CREATE TYPE "TransactionCorrectionAction" AS ENUM ('update', 'delete');

-- AlterTable
ALTER TABLE "Account" ALTER COLUMN "initialBalance" SET DATA TYPE DECIMAL(30,18);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "accountAmount" DECIMAL(30,18),
ADD COLUMN     "destinationAmount" DECIMAL(30,18),
ADD COLUMN     "feeAmount" DECIMAL(30,18),
ADD COLUMN     "feeCurrency" TEXT,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(30,18);

-- CreateTable
CREATE TABLE "TransactionCorrection" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "TransactionCorrectionAction" NOT NULL,
    "previous" JSONB NOT NULL,
    "corrected" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransactionCorrection_userId_transactionId_createdAt_idx" ON "TransactionCorrection"("userId", "transactionId", "createdAt");

-- AddForeignKey
ALTER TABLE "TransactionCorrection" ADD CONSTRAINT "TransactionCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "Transaction" SET "accountAmount" = "amount"
  WHERE "accountId" IS NOT NULL AND "accountAmount" IS NULL;

UPDATE "Transaction" SET "destinationAmount" = "amount"
  WHERE "type" = 'transfer' AND "transferToAccountId" IS NOT NULL AND "destinationAmount" IS NULL;
