-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "amountInPreferredCurrency" DECIMAL(12,2),
ADD COLUMN     "exchangeRate" DECIMAL(20,8) NOT NULL DEFAULT 1,
ADD COLUMN     "executionCurrency" TEXT NOT NULL DEFAULT 'USD';

-- Backfill: existing transactions predate per-transaction currency tracking,
-- so they are assumed USD at a 1:1 rate (matching the column defaults above).
UPDATE "Transaction" SET "amountInPreferredCurrency" = "amount" WHERE "amountInPreferredCurrency" IS NULL;

ALTER TABLE "Transaction" ALTER COLUMN "amountInPreferredCurrency" SET NOT NULL;
