-- CreateTable
CREATE TABLE "CreditCardPeriodOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "monthIndex" INTEGER NOT NULL,
    "closingDate" DATE,
    "dueDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCardPeriodOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditCardPeriodOverride_userId_idx" ON "CreditCardPeriodOverride"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCardPeriodOverride_accountId_monthIndex_key" ON "CreditCardPeriodOverride"("accountId", "monthIndex");

-- AddForeignKey
ALTER TABLE "CreditCardPeriodOverride" ADD CONSTRAINT "CreditCardPeriodOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardPeriodOverride" ADD CONSTRAINT "CreditCardPeriodOverride_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

