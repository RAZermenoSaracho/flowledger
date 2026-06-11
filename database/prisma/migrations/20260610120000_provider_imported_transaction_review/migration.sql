ALTER TABLE "ProviderImportedTransaction" ADD COLUMN "transactionId" TEXT;
ALTER TABLE "ProviderImportedTransaction" ADD COLUMN "categoryId" TEXT;

CREATE UNIQUE INDEX "ProviderImportedTransaction_transactionId_key" ON "ProviderImportedTransaction"("transactionId");
CREATE INDEX "ProviderImportedTransaction_categoryId_idx" ON "ProviderImportedTransaction"("categoryId");

ALTER TABLE "ProviderImportedTransaction"
ADD CONSTRAINT "ProviderImportedTransaction_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProviderImportedTransaction"
ADD CONSTRAINT "ProviderImportedTransaction_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
