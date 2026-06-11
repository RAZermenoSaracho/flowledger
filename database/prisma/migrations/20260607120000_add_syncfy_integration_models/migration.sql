CREATE TABLE "SyncfyWebhookEvent" (
  "id" TEXT NOT NULL,
  "rid" TEXT,
  "eventEid" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "syncfyUserId" TEXT,
  "syncfyExternalId" TEXT,
  "syncfyCredentialId" TEXT,
  "rawPayload" JSONB NOT NULL,
  "rawHeaders" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'received',
  "errorMessage" TEXT,

  CONSTRAINT "SyncfyWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncfyImportedTransaction" (
  "id" TEXT NOT NULL,
  "syncfyTransactionId" TEXT NOT NULL,
  "syncfyCredentialId" TEXT NOT NULL,
  "syncfyAccountId" TEXT NOT NULL,
  "userId" TEXT,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "transactionDate" TIMESTAMP(3) NOT NULL,
  "refreshDate" TIMESTAMP(3) NOT NULL,
  "rawData" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SyncfyImportedTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyncfyWebhookEvent_eventEid_key" ON "SyncfyWebhookEvent"("eventEid");
CREATE INDEX "SyncfyWebhookEvent_syncfyUserId_idx" ON "SyncfyWebhookEvent"("syncfyUserId");
CREATE INDEX "SyncfyWebhookEvent_syncfyExternalId_idx" ON "SyncfyWebhookEvent"("syncfyExternalId");
CREATE INDEX "SyncfyWebhookEvent_syncfyCredentialId_idx" ON "SyncfyWebhookEvent"("syncfyCredentialId");
CREATE INDEX "SyncfyWebhookEvent_status_idx" ON "SyncfyWebhookEvent"("status");
CREATE INDEX "SyncfyWebhookEvent_receivedAt_idx" ON "SyncfyWebhookEvent"("receivedAt");

CREATE UNIQUE INDEX "SyncfyImportedTransaction_syncfyTransactionId_key" ON "SyncfyImportedTransaction"("syncfyTransactionId");
CREATE INDEX "SyncfyImportedTransaction_syncfyCredentialId_idx" ON "SyncfyImportedTransaction"("syncfyCredentialId");
CREATE INDEX "SyncfyImportedTransaction_syncfyAccountId_idx" ON "SyncfyImportedTransaction"("syncfyAccountId");
CREATE INDEX "SyncfyImportedTransaction_userId_idx" ON "SyncfyImportedTransaction"("userId");
CREATE INDEX "SyncfyImportedTransaction_transactionDate_idx" ON "SyncfyImportedTransaction"("transactionDate");
CREATE INDEX "SyncfyImportedTransaction_refreshDate_idx" ON "SyncfyImportedTransaction"("refreshDate");

ALTER TABLE "SyncfyImportedTransaction"
ADD CONSTRAINT "SyncfyImportedTransaction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
