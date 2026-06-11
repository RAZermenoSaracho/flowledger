-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'provider_transactions_pending';

-- AlterTable
ALTER TABLE "ProviderImportedTransaction" ALTER COLUMN "status" SET DEFAULT 'pending';
