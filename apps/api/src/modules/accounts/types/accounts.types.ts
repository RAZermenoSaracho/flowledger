export type ProviderAccountWithConnection = {
  id: string;
  provider: string;
  providerCredentialId: string;
  providerAccountId: string;
  accountMetadata: unknown;
  status: string;
  failureReason: string | null;
  requiresManualReconnect: boolean;
  lastSyncAt: Date | null;
  lastSyncSuccessAt: Date | null;
  lastSyncFailureAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  connection: {
    id: string;
    institutionId: string | null;
    institutionName: string | null;
    status: string;
    failureReason: string | null;
    requiresManualReconnect: boolean;
    lastSyncAt: Date | null;
    lastSyncSuccessAt: Date | null;
    lastSyncFailureAt: Date | null;
  } | null;
};
