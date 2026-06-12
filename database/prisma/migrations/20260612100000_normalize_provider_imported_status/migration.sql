UPDATE "ProviderImportedTransaction"
SET "status" = 'pending'
WHERE "status" = 'imported'
  AND "transactionId" IS NULL;

UPDATE "ProviderImportedTransaction"
SET "status" = 'processed'
WHERE "status" = 'imported'
  AND "transactionId" IS NOT NULL;
