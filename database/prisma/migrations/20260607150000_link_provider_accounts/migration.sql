ALTER TABLE "ProviderAccount" ADD COLUMN "accountId" TEXT;

ALTER TABLE "ProviderAccount"
ADD CONSTRAINT "ProviderAccount_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ProviderAccount_accountId_idx" ON "ProviderAccount"("accountId");
