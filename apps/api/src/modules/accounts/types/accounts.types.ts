import type { AccountType } from "@flowledger/shared";
import type { DataSieveQuery } from "datasieve";
import type { RawWhereNode } from "../../../db/sieve.types.js";

/** Minimal provider-connection shape embedded in an {@link AccountListRecord}'s `providerAccounts`. */
type AccountConnectionRef = {
  id: string;
  institutionId: string | null;
  institutionName: string | null;
  status: string;
  failureReason: string | null;
  requiresManualReconnect: boolean;
  lastSyncAt: Date | null;
  lastSyncSuccessAt: Date | null;
  lastSyncFailureAt: Date | null;
};

/** Minimal provider-account shape embedded in an {@link AccountListRecord}. */
type AccountProviderAccountRef = {
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
  connection: AccountConnectionRef | null;
};

/**
 * Plain domain shape for `Account`, written for datasieve's generic inference
 * (`DataSieveQuery<AccountListRecord>`). `providerAccounts` being a real
 * array field (not a virtual one) is what lets a "source" filter be
 * expressed as an ordinary `{field:"providerAccounts", op:"exists"|"notExists"}`
 * condition — no virtual-field expansion needed, unlike transactions'
 * `classification`/`transactionFilterType`.
 */
export interface AccountListRecord {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  identifier: string | null;
  currency: string;
  initialBalance: number;
  isArchived: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  providerAccounts: AccountProviderAccountRef[];
}

/**
 * Untrusted shape of the decoded `query` request param for `GET /accounts`.
 * `where` is a {@link RawWhereNode}: it may contain leaf conditions on one
 * virtual field name ("source") that isn't a real `Account` column —
 * `read.service.ts`'s `expandVirtualConditions` rewrites it in place into
 * the real `providerAccounts` exists/notExists condition it means.
 */
export type AccountsQueryInput = {
  where?: RawWhereNode;
  sort?: DataSieveQuery<AccountListRecord>["sort"];
};

/** A `ProviderAccount` joined with its parent `ProviderConnection`, as needed to build sync-status summaries. */
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

/** Plain domain shape for `ProviderAccount` joined with its `account`/`connection`, written for datasieve's generic inference in `listProviderAccounts`. */
export type ProviderAccountListRecord = ProviderAccountWithConnection & {
  accountId: string | null;
  account: {
    id: string;
    name: string;
    type: AccountType;
  } | null;
};
