import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test-jwt-secret-with-enough-length";
process.env.GOOGLE_CLIENT_ID ??= "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-google-client-secret";
process.env.GOOGLE_CALLBACK_URL ??=
  "http://localhost:4000/auth/google/callback";
process.env.WEB_APP_URL ??= "http://localhost:5173";
process.env.NODE_ENV ??= "test";

const {
  generatedSyncfyEventEid,
  recordSyncfyEventWithDependencies,
  syncfyWebhookSchema
} = await import("../src/modules/providers/providerWebhooks.routes.ts");
const { syncfyProvider } =
  await import("../src/modules/providers/syncfy/syncfy.adapter.ts");
const { normalizeSyncfyInstitution } =
  await import("../src/modules/providers/syncfy/syncfy.service.ts");
const { accountListItemWithSyncSummary } =
  await import("../src/modules/accounts/accounts.routes.ts");

const webhookPayload = {
  rid: "rid_1",
  events: [
    {
      header: {
        event: {
          eid: "evt_transactions_ready",
          name: "credentials.updated"
        },
        user: {
          id_user: "syncfy_user_1",
          id_external: "flowledger_user_1"
        }
      },
      payload: {
        id_credential: "credential_1",
        endpoints: {
          accounts: "/accounts",
          transactions: ["/transactions"]
        }
      }
    }
  ]
};

const parsedWebhook = syncfyWebhookSchema.parse(webhookPayload);
assert.equal(parsedWebhook.rid, "rid_1");
assert.equal(parsedWebhook.events.length, 1);
assert.equal(
  parsedWebhook.events[0]?.header.event.eid,
  "evt_transactions_ready"
);
assert.equal(parsedWebhook.events[0]?.payload.id_credential, "credential_1");

const eventWithoutEid = {
  header: {
    event: { name: "credentials.updated" },
    user: { id_user: "syncfy_user_1" }
  },
  payload: { id_credential: "credential_1" }
};
assert.equal(
  generatedSyncfyEventEid("rid_1", eventWithoutEid, 0),
  generatedSyncfyEventEid("rid_1", eventWithoutEid, 0)
);
assert.notEqual(
  generatedSyncfyEventEid("rid_1", eventWithoutEid, 0),
  generatedSyncfyEventEid("rid_1", eventWithoutEid, 1)
);

const duplicateError = new Prisma.PrismaClientKnownRequestError(
  "Unique constraint failed",
  {
    code: "P2002",
    clientVersion: "test"
  }
);
const duplicateResult = await recordSyncfyEventWithDependencies({
  rid: "rid_1",
  event: parsedWebhook.events[0]!,
  rawHeaders: {},
  rawBody: JSON.stringify(webhookPayload),
  index: 0,
  findFlowLedgerUserId: async () => "flowledger_user_1",
  createProviderWebhookEvent: async () => {
    throw duplicateError;
  },
  findProviderWebhookEvent: async ({ provider, providerEventId }) => ({
    id: `${provider}:${providerEventId}`
  })
});
assert.equal(duplicateResult.shouldProcess, false);
assert.equal(duplicateResult.recordedEvent.id, "syncfy:evt_transactions_ready");

const account = syncfyProvider.normalizeAccount!({
  account: {
    id_account: "account_1",
    name: "Main checking",
    type: "checking",
    currency: "MXN",
    balance: "1234.56"
  },
  fallbackCredentialId: "credential_1"
});
assert.deepEqual(account, {
  provider: "syncfy",
  providerAccountId: "account_1",
  providerCredentialId: "credential_1",
  name: "Main checking",
  type: "checking",
  currency: "MXN",
  balance: 1234.56,
  rawData: {
    id_account: "account_1",
    name: "Main checking",
    type: "checking",
    currency: "MXN",
    balance: "1234.56"
  }
});

const transaction = syncfyProvider.normalizeTransaction!({
  transaction: {
    id_transaction: "transaction_1",
    id_account: "account_1",
    description: "Coffee",
    amount: "-48.5",
    currency: "MXN",
    dt_transaction: 1_780_790_400,
    dt_refresh: 1_780_876_800
  },
  fallbackCredentialId: "credential_1"
});
assert.equal(transaction.provider, "syncfy");
assert.equal(transaction.providerTransactionId, "transaction_1");
assert.equal(transaction.providerCredentialId, "credential_1");
assert.equal(transaction.providerAccountId, "account_1");
assert.equal(transaction.description, "Coffee");
assert.equal(transaction.amount, -48.5);
assert.equal(transaction.currency, "MXN");
assert.equal(
  transaction.transactionDate.toISOString(),
  "2026-06-07T00:00:00.000Z"
);
assert.equal(
  transaction.refreshDate?.toISOString(),
  "2026-06-08T00:00:00.000Z"
);

const institution = normalizeSyncfyInstitution({
  id_site: "mx-bank",
  display_name: "Banco Demo",
  logo_url: "https://example.test/logo.png",
  country: { code: "mx", name: "Mexico" },
  type: "bank",
  products: ["checking", "savings", "checking"]
});
assert.deepEqual(institution, {
  syncfyInstitutionId: "mx-bank",
  name: "Banco Demo",
  logoUrl: "https://example.test/logo.png",
  country: "mx",
  category: "bank",
  supportedAccountTypes: ["checking", "savings", "bank"],
  rawData: {
    id_site: "mx-bank",
    display_name: "Banco Demo",
    logo_url: "https://example.test/logo.png",
    country: { code: "mx", name: "Mexico" },
    type: "bank",
    products: ["checking", "savings", "checking"]
  }
});

const createdAt = new Date("2026-06-07T12:00:00.000Z");
const manualAccount = accountListItemWithSyncSummary({
  id: "manual_account_1",
  userId: "flowledger_user_1",
  name: "Cash wallet",
  type: "cash",
  identifier: null,
  initialBalance: { toNumber: () => 100 },
  isArchived: false,
  archivedAt: null,
  createdAt,
  updatedAt: createdAt,
  balance: 100,
  providerAccounts: []
});
assert.equal(manualAccount.source, "manual");
assert.deepEqual(manualAccount.sync, []);
assert.equal(manualAccount.name, "Cash wallet");
