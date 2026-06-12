import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test-jwt-secret-with-enough-length";
process.env.GOOGLE_CLIENT_ID ??= "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-google-client-secret";
process.env.GOOGLE_CALLBACK_URL ??=
  "http://localhost:4000/auth/google/callback";
process.env.WEB_APP_URL ??= "http://localhost:5173";
process.env.NODE_ENV ??= "test";

const {
  buildSyncfyRefreshMetadata,
  buildSyncfyProviderAccountMetadata,
  buildSyncfyTransactionDataUrl,
  countNewSyncfyImportedTransactionIds,
  fetchSyncfyTransactions,
  getSyncfyRefreshMetadata,
  getSyncfyEndpointList,
  normalizeSyncfyTransaction,
  nextSyncfyImportedTransactionStatus,
  resolveSyncfyImportedTransactionStatus,
  summarizeSyncfyEndpoints,
  summarizeSyncfyImportedTransactionWrites,
  shouldMarkSyncfyManualReconnect
} = await import("../src/modules/providers/syncfy/syncfy.service.ts");
const { SyncfyAutoSyncScheduler } = await import(
  "../src/modules/providers/syncfy/syncfyAutoSyncScheduler.ts"
);

assert.equal(
  shouldMarkSyncfyManualReconnect(new Error("Syncfy requires OTP")),
  true
);
assert.equal(
  shouldMarkSyncfyManualReconnect(new Error("Syncfy resync timed out")),
  false
);
assert.equal(
  shouldMarkSyncfyManualReconnect(new Error("Temporary upstream 502")),
  false
);

assert.equal(
  countNewSyncfyImportedTransactionIds({
    existingTransactionIds: new Set(["tx_1"]),
    transactions: [
      { syncfyTransactionId: "tx_1" },
      { syncfyTransactionId: "tx_2" }
    ]
  }),
  1
);

const endpointPayload = {
  accounts: ["/v1/accounts?id_credential=credential_1"],
  transactions: ["/v1/transactions?id_credential=credential_1"]
};
assert.deepEqual(getSyncfyEndpointList(endpointPayload, "accounts"), [
  "/v1/accounts?id_credential=credential_1"
]);
assert.deepEqual(getSyncfyEndpointList(endpointPayload, "transactions"), [
  "/v1/transactions?id_credential=credential_1"
]);
assert.deepEqual(summarizeSyncfyEndpoints(endpointPayload), {
  accountEndpointCount: 1,
  transactionEndpointCount: 1,
  endpointTypes: ["accounts", "transactions"]
});

const refreshMetadata = buildSyncfyRefreshMetadata({
  providerCredentialId: "credential_1",
  providerUserId: "syncfy_user_1",
  endpoints: {
    accounts: [
      "/v1/accounts?id_credential=credential_1&token=secret_token&api_key=secret_key"
    ],
    transactions: [
      "/v1/transactions?id_credential=credential_1&dt_refresh_from=1&dt_refresh_to=2&limit=10&skip=20&username=bank_user&password=bank_password&include_pending=true"
    ]
  },
  now: new Date("2026-06-12T00:00:00.000Z")
});
assert.deepEqual(refreshMetadata.endpoints, {
  accounts: ["/v1/accounts?id_credential=credential_1"],
  transactions: [
    "/v1/transactions?id_credential=credential_1&dt_refresh_from=1&dt_refresh_to=2&limit=10&skip=20&include_pending=true"
  ]
});
assert.equal(refreshMetadata.endpointSummary.accountEndpointCount, 1);
assert.equal(refreshMetadata.endpointSummary.transactionEndpointCount, 1);
assert.equal(refreshMetadata.storedAt, "2026-06-12T00:00:00.000Z");
assert.equal(refreshMetadata.updatedAt, "2026-06-12T00:00:00.000Z");
assert.deepEqual(
  getSyncfyRefreshMetadata({
    syncfyRefreshMetadata: refreshMetadata
  }),
  {
    providerUserId: "syncfy_user_1",
    endpoints: refreshMetadata.endpoints
  }
);

const transactionUrl = buildSyncfyTransactionDataUrl({
  endpoint:
    "/v1/transactions?id_credential=credential_1&dt_refresh_from=1&dt_refresh_to=2&limit=10&skip=20&include_pending=true",
  token: "session_token",
  now: new Date("2026-06-12T00:00:00.000Z")
});
assert.equal(transactionUrl.searchParams.get("id_credential"), "credential_1");
assert.equal(transactionUrl.searchParams.get("include_pending"), "true");
assert.equal(transactionUrl.searchParams.get("dt_refresh_to"), "1781222400");
assert.equal(transactionUrl.searchParams.get("dt_refresh_from"), "1780012800");
assert.equal(transactionUrl.searchParams.get("limit"), "500");
assert.equal(transactionUrl.searchParams.get("skip"), "0");
assert.equal(transactionUrl.searchParams.get("token"), "session_token");

const paginatedSkipValues: string[] = [];
const paginatedTransactions = await fetchSyncfyTransactions(
  "/v1/transactions?id_credential=credential_1&dt_refresh_from=1&dt_refresh_to=2&limit=1&skip=99",
  "session_token",
  "credential_1",
  {
    limit: 2,
    now: new Date("2026-06-12T00:00:00.000Z"),
    fetchPage: async (url) => {
      paginatedSkipValues.push(url.searchParams.get("skip") ?? "");
      assert.equal(url.searchParams.get("limit"), "2");
      assert.equal(url.searchParams.get("dt_refresh_from"), "1780012800");
      assert.equal(url.searchParams.get("dt_refresh_to"), "1781222400");

      const skip = Number(url.searchParams.get("skip") ?? 0);
      const rows = [
        {
          id_transaction: `tx_${skip}`,
          id_credential: "credential_1",
          id_account: "account_1",
          description: `Transaction ${skip}`,
          amount: skip + 1,
          currency: "MXN",
          dt_transaction: 1_781_222_000 + skip,
          dt_refresh: 1_781_222_100 + skip
        },
        {
          id_transaction: `tx_${skip + 1}`,
          id_credential: "credential_1",
          id_account: "account_1",
          description: `Transaction ${skip + 1}`,
          amount: skip + 2,
          currency: "MXN",
          dt_transaction: 1_781_222_001 + skip,
          dt_refresh: 1_781_222_101 + skip
        }
      ];

      return {
        response: skip === 0 ? rows : rows.slice(0, 1)
      };
    }
  }
);
assert.deepEqual(paginatedSkipValues, ["0", "2"]);
assert.equal(paginatedTransactions.length, 3);

assert.deepEqual(
  buildSyncfyProviderAccountMetadata({
    name: "Checking",
    type: "checking",
    currency: "MXN",
    balance: 25
  }),
  {
    name: "Checking",
    type: "checking",
    currency: "MXN",
    balance: 25
  }
);

const refreshedTransaction = normalizeSyncfyTransaction({
  id_transaction: "syncfy_tx_5",
  id_credential: "credential_1",
  id_account: "account_1",
  description: "Latest deposit",
  amount: 5,
  currency: "MXN",
  dt_transaction: 1_717_200_000,
  dt_refresh: 1_717_200_100
});
assert.equal(refreshedTransaction.amount, 5);
assert.deepEqual(
  {
    accountMetadata: buildSyncfyProviderAccountMetadata({
      name: "Checking",
      type: "checking",
      currency: "MXN",
      balance: 25
    }),
    transactionStatus: resolveSyncfyImportedTransactionStatus({
      existingStatus: undefined
    }),
    transactionAmount: refreshedTransaction.amount
  },
  {
    accountMetadata: {
      name: "Checking",
      type: "checking",
      currency: "MXN",
      balance: 25
    },
    transactionStatus: "pending",
    transactionAmount: 5
  }
);
assert.equal(
  resolveSyncfyImportedTransactionStatus({ existingStatus: undefined }),
  "pending"
);
assert.equal(
  resolveSyncfyImportedTransactionStatus({
    existingStatus: "ignored",
    transactionId: null
  }),
  "ignored"
);
assert.equal(
  resolveSyncfyImportedTransactionStatus({
    existingStatus: "processed",
    transactionId: "transaction_1"
  }),
  "processed"
);
assert.equal(
  resolveSyncfyImportedTransactionStatus({
    existingStatus: "imported",
    transactionId: null
  }),
  "pending"
);

assert.deepEqual(
  summarizeSyncfyImportedTransactionWrites({
    existingTransactionIds: new Set(["tx_existing"]),
    transactions: [
      { syncfyTransactionId: "tx_existing" },
      { syncfyTransactionId: "tx_new" }
    ]
  }),
  {
    insertedOrUpdatedImportedTransactions: 1,
    skippedDuplicateTransactions: 1
  }
);

assert.equal(
  nextSyncfyImportedTransactionStatus({
    status: "imported",
    transactionId: null
  }),
  "pending"
);
assert.equal(
  nextSyncfyImportedTransactionStatus({
    status: "imported",
    transactionId: "tx_1"
  }),
  "processed"
);
assert.equal(
  nextSyncfyImportedTransactionStatus({
    status: "ignored",
    transactionId: null
  }),
  "ignored"
);

let disabledLoadCalls = 0;
const disabledScheduler = new SyncfyAutoSyncScheduler({
  enabled: false,
  intervalMinutes: 60,
  jobTimeoutMs: 1000,
  concurrency: 1,
  loadJobs: async () => {
    disabledLoadCalls += 1;
    return [];
  },
  processJob: async () => undefined
});
assert.deepEqual(await disabledScheduler.runOnce(), {
  skipped: true,
  reason: "disabled"
});
assert.equal(disabledLoadCalls, 0);

let releaseJob: (() => void) | undefined;
let processedJobs = 0;
const overlappingScheduler = new SyncfyAutoSyncScheduler({
  enabled: true,
  intervalMinutes: 60,
  jobTimeoutMs: 1000,
  concurrency: 1,
  loadJobs: async () => [{ connectionId: "conn_1", userId: "user_1" }],
  processJob: async () => {
    processedJobs += 1;
    await new Promise<void>((resolve) => {
      releaseJob = resolve;
    });
  },
  log: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  }
});

const firstRun = overlappingScheduler.runOnce();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepEqual(await overlappingScheduler.runOnce(), {
  skipped: true,
  reason: "overlap"
});
releaseJob?.();
assert.deepEqual(await firstRun, {
  skipped: false,
  queued: 1,
  processed: 1,
  failed: 0
});
assert.equal(processedJobs, 1);
