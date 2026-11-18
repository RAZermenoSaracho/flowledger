-- DropIndex
DROP INDEX "Holding_accountId_kind_code_key";

-- AlterTable
ALTER TABLE "Holding" ADD COLUMN     "exchange" VARCHAR(10),
ADD COLUMN     "quoteCurrency" VARCHAR(10);

-- CreateTable
CREATE TABLE "SecurityQuote" (
    "symbol" VARCHAR(15) NOT NULL,
    "exchange" VARCHAR(10) NOT NULL,
    "currency" VARCHAR(10),
    "price" DECIMAL(38,18),
    "quotedAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3),
    "marketOpen" BOOLEAN,
    "failedAt" TIMESTAMP(3),
    "failureReason" VARCHAR(40),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityQuote_pkey" PRIMARY KEY ("symbol","exchange")
);

-- CreateTable
CREATE TABLE "ProviderCreditWindow" (
    "provider" VARCHAR(20) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProviderCreditWindow_pkey" PRIMARY KEY ("provider","kind","windowStart")
);

-- CreateIndex
CREATE UNIQUE INDEX "Holding_accountId_kind_code_exchange_key" ON "Holding"("accountId", "kind", "code", "exchange");

