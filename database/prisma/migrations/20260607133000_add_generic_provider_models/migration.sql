CREATE TABLE "ProviderConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerUserId" TEXT,
  "providerCredentialId" TEXT NOT NULL,
  "institutionId" TEXT,
  "institutionName" TEXT,
  "institutionMetadata" JSONB,
  "status" TEXT NOT NULL DEFAULT 'active',
  "lastSyncAt" TIMESTAMP(3),
  "rawData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProviderConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "connectionId" TEXT,
  "provider" TEXT NOT NULL,
  "providerUserId" TEXT,
  "providerCredentialId" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "institutionMetadata" JSONB,
  "accountMetadata" JSONB,
  "status" TEXT NOT NULL DEFAULT 'active',
  "lastSyncAt" TIMESTAMP(3),
  "rawData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProviderAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderImportedTransaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "connectionId" TEXT,
  "providerAccountRefId" TEXT,
  "provider" TEXT NOT NULL,
  "providerUserId" TEXT,
  "providerCredentialId" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "providerTransactionId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "transactionDate" TIMESTAMP(3) NOT NULL,
  "refreshDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'imported',
  "errorMessage" TEXT,
  "rawData" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProviderImportedTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderWebhookEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "provider" TEXT NOT NULL,
  "providerUserId" TEXT,
  "providerExternalId" TEXT,
  "providerCredentialId" TEXT,
  "providerEventId" TEXT NOT NULL,
  "rid" TEXT,
  "eventName" TEXT NOT NULL,
  "rawPayload" JSONB NOT NULL,
  "rawHeaders" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'received',
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProviderWebhookEvent_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ProviderImportedTransaction" (
  "id",
  "userId",
  "provider",
  "providerCredentialId",
  "providerAccountId",
  "providerTransactionId",
  "description",
  "amount",
  "currency",
  "transactionDate",
  "refreshDate",
  "status",
  "rawData",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "userId",
  'syncfy',
  "syncfyCredentialId",
  "syncfyAccountId",
  "syncfyTransactionId",
  "description",
  "amount",
  "currency",
  "transactionDate",
  "refreshDate",
  'imported',
  "rawData",
  "createdAt",
  CURRENT_TIMESTAMP
FROM "SyncfyImportedTransaction";

INSERT INTO "ProviderWebhookEvent" (
  "id",
  "provider",
  "providerUserId",
  "providerExternalId",
  "providerCredentialId",
  "providerEventId",
  "rid",
  "eventName",
  "rawPayload",
  "rawHeaders",
  "receivedAt",
  "processedAt",
  "status",
  "errorMessage",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  'syncfy',
  "syncfyUserId",
  "syncfyExternalId",
  "syncfyCredentialId",
  "eventEid",
  "rid",
  "eventName",
  "rawPayload",
  "rawHeaders",
  "receivedAt",
  "processedAt",
  "status",
  "errorMessage",
  "receivedAt",
  CURRENT_TIMESTAMP
FROM "SyncfyWebhookEvent";

CREATE UNIQUE INDEX "ProviderConnection_provider_providerCredentialId_key" ON "ProviderConnection"("provider", "providerCredentialId");
CREATE INDEX "ProviderConnection_userId_idx" ON "ProviderConnection"("userId");
CREATE INDEX "ProviderConnection_provider_providerUserId_idx" ON "ProviderConnection"("provider", "providerUserId");
CREATE INDEX "ProviderConnection_provider_status_idx" ON "ProviderConnection"("provider", "status");

CREATE UNIQUE INDEX "ProviderAccount_provider_providerCredentialId_providerAccountId_key" ON "ProviderAccount"("provider", "providerCredentialId", "providerAccountId");
CREATE INDEX "ProviderAccount_userId_idx" ON "ProviderAccount"("userId");
CREATE INDEX "ProviderAccount_connectionId_idx" ON "ProviderAccount"("connectionId");
CREATE INDEX "ProviderAccount_provider_providerUserId_idx" ON "ProviderAccount"("provider", "providerUserId");
CREATE INDEX "ProviderAccount_provider_status_idx" ON "ProviderAccount"("provider", "status");

CREATE UNIQUE INDEX "ProviderImportedTransaction_provider_providerTransactionId_key" ON "ProviderImportedTransaction"("provider", "providerTransactionId");
CREATE INDEX "ProviderImportedTransaction_userId_idx" ON "ProviderImportedTransaction"("userId");
CREATE INDEX "ProviderImportedTransaction_connectionId_idx" ON "ProviderImportedTransaction"("connectionId");
CREATE INDEX "ProviderImportedTransaction_providerAccountRefId_idx" ON "ProviderImportedTransaction"("providerAccountRefId");
CREATE INDEX "ProviderImportedTransaction_provider_providerCredentialId_idx" ON "ProviderImportedTransaction"("provider", "providerCredentialId");
CREATE INDEX "ProviderImportedTransaction_provider_providerAccountId_idx" ON "ProviderImportedTransaction"("provider", "providerAccountId");
CREATE INDEX "ProviderImportedTransaction_transactionDate_idx" ON "ProviderImportedTransaction"("transactionDate");
CREATE INDEX "ProviderImportedTransaction_refreshDate_idx" ON "ProviderImportedTransaction"("refreshDate");
CREATE INDEX "ProviderImportedTransaction_status_idx" ON "ProviderImportedTransaction"("status");

CREATE UNIQUE INDEX "ProviderWebhookEvent_provider_providerEventId_key" ON "ProviderWebhookEvent"("provider", "providerEventId");
CREATE INDEX "ProviderWebhookEvent_userId_idx" ON "ProviderWebhookEvent"("userId");
CREATE INDEX "ProviderWebhookEvent_provider_providerUserId_idx" ON "ProviderWebhookEvent"("provider", "providerUserId");
CREATE INDEX "ProviderWebhookEvent_provider_providerExternalId_idx" ON "ProviderWebhookEvent"("provider", "providerExternalId");
CREATE INDEX "ProviderWebhookEvent_provider_providerCredentialId_idx" ON "ProviderWebhookEvent"("provider", "providerCredentialId");
CREATE INDEX "ProviderWebhookEvent_provider_status_idx" ON "ProviderWebhookEvent"("provider", "status");
CREATE INDEX "ProviderWebhookEvent_receivedAt_idx" ON "ProviderWebhookEvent"("receivedAt");

ALTER TABLE "ProviderConnection"
ADD CONSTRAINT "ProviderConnection_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProviderAccount"
ADD CONSTRAINT "ProviderAccount_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProviderAccount"
ADD CONSTRAINT "ProviderAccount_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "ProviderConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProviderImportedTransaction"
ADD CONSTRAINT "ProviderImportedTransaction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProviderImportedTransaction"
ADD CONSTRAINT "ProviderImportedTransaction_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "ProviderConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProviderImportedTransaction"
ADD CONSTRAINT "ProviderImportedTransaction_providerAccountRefId_fkey"
FOREIGN KEY ("providerAccountRefId") REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProviderWebhookEvent"
ADD CONSTRAINT "ProviderWebhookEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP TABLE "SyncfyImportedTransaction";
DROP TABLE "SyncfyWebhookEvent";
