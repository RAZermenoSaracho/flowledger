-- CreateEnum
CREATE TYPE "PaymentDueRule" AS ENUM ('day_of_next_month', 'days_after_closing');

-- CreateEnum
CREATE TYPE "CreditCardKind" AS ENUM ('payment', 'refund', 'cashback', 'interest');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'credit_card_period_closed';
ALTER TYPE "NotificationType" ADD VALUE 'credit_card_payment_due_soon';
ALTER TYPE "NotificationType" ADD VALUE 'credit_card_period_partially_paid';
ALTER TYPE "NotificationType" ADD VALUE 'credit_card_period_paid';
ALTER TYPE "NotificationType" ADD VALUE 'credit_card_payment_overdue';

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "annualInterestRate" DECIMAL(38,18),
ADD COLUMN     "billingTimeZone" TEXT,
ADD COLUMN     "creditLimit" DECIMAL(38,18),
ADD COLUMN     "paymentDueRule" "PaymentDueRule",
ADD COLUMN     "paymentDueValue" INTEGER,
ADD COLUMN     "statementClosingDay" INTEGER;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "creditCardKind" "CreditCardKind";

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupeKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

