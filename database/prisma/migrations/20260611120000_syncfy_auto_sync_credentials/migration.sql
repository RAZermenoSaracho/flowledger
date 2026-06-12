-- Add provider credential state used by headless resync and auto-sync.
ALTER TABLE "ProviderConnection"
  ADD COLUMN "failureReason" TEXT,
  ADD COLUMN "requiresManualReconnect" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastSyncSuccessAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncFailureAt" TIMESTAMP(3);

ALTER TABLE "ProviderAccount"
  ADD COLUMN "failureReason" TEXT,
  ADD COLUMN "requiresManualReconnect" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastSyncSuccessAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncFailureAt" TIMESTAMP(3);

CREATE TABLE "ProviderCredentialSecret" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "connectionId" TEXT,
  "providerAccountRefId" TEXT,
  "provider" TEXT NOT NULL,
  "providerCredentialId" TEXT NOT NULL,
  "credentialType" TEXT NOT NULL,
  "maskedIdentifier" TEXT,
  "encryptedPayload" TEXT NOT NULL,
  "encryptionMetadata" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "failureReason" TEXT,
  "requiresManualReconnect" BOOLEAN NOT NULL DEFAULT false,
  "lastSuccessAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProviderCredentialSecret_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderCredentialSecret_provider_providerCredentialId_credentialType_key"
  ON "ProviderCredentialSecret"("provider", "providerCredentialId", "credentialType");
CREATE INDEX "ProviderCredentialSecret_userId_idx" ON "ProviderCredentialSecret"("userId");
CREATE INDEX "ProviderCredentialSecret_connectionId_idx" ON "ProviderCredentialSecret"("connectionId");
CREATE INDEX "ProviderCredentialSecret_providerAccountRefId_idx" ON "ProviderCredentialSecret"("providerAccountRefId");
CREATE INDEX "ProviderCredentialSecret_provider_status_idx" ON "ProviderCredentialSecret"("provider", "status");
CREATE INDEX "ProviderCredentialSecret_provider_requiresManualReconnect_idx"
  ON "ProviderCredentialSecret"("provider", "requiresManualReconnect");

ALTER TABLE "ProviderCredentialSecret"
  ADD CONSTRAINT "ProviderCredentialSecret_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProviderCredentialSecret"
  ADD CONSTRAINT "ProviderCredentialSecret_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "ProviderConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProviderCredentialSecret"
  ADD CONSTRAINT "ProviderCredentialSecret_providerAccountRefId_fkey"
  FOREIGN KEY ("providerAccountRefId") REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
