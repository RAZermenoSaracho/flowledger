-- CreateEnum
CREATE TYPE "HoldingKind" AS ENUM ('crypto', 'fiat');

-- AlterEnum
ALTER TYPE "AccountType" ADD VALUE 'crypto';

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" "HoldingKind" NOT NULL,
    "code" TEXT NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "manualUnitPrice" DECIMAL(38,18),
    "manualPriceCurrency" TEXT,
    "manualPricedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Holding_userId_idx" ON "Holding"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_accountId_kind_code_key" ON "Holding"("accountId", "kind", "code");

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
