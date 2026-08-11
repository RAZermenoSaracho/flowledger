import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../config/env.js", () => ({
  env: {
    SYNCFY_API_BASE_URL: "https://api.syncfy.test",
    SYNCFY_DATA_BASE_URL: "https://data.syncfy.test",
    SYNCFY_API_KEY: "test-api-key"
  }
}));

const {
  createSyncfySession,
  createSyncfyUser,
  fetchSyncfyAccounts,
  fetchSyncfyTransactions,
  fetchSyncfyUserByExternalId,
  normalizeSyncfyAccount,
  normalizeSyncfyInstitution,
  normalizeSyncfyTransaction
} = await import("../syncfy.client.js");

describe("normalizeSyncfyAccount", () => {
  it("maps id_account/id_credential/name/type/currency/balance", () => {
    const account = normalizeSyncfyAccount({
      id_account: "acc-1",
      id_credential: "cred-1",
      name: "Checking",
      type: "checking",
      currency: "MXN",
      balance: "1234.56"
    });

    expect(account).toMatchObject({
      syncfyAccountId: "acc-1",
      syncfyCredentialId: "cred-1",
      name: "Checking",
      type: "checking",
      currency: "MXN",
      balance: 1234.56
    });
  });

  it("falls back to id, description/number for name, and fallbackCredentialId", () => {
    const account = normalizeSyncfyAccount(
      { id: "acc-2", number: "**** 1234" },
      "fallback-cred"
    );

    expect(account.syncfyAccountId).toBe("acc-2");
    expect(account.syncfyCredentialId).toBe("fallback-cred");
    expect(account.name).toBe("**** 1234");
  });

  it("defaults name to 'Syncfy account' when nothing is present", () => {
    expect(normalizeSyncfyAccount({ id_account: "acc-3" }).name).toBe(
      "Syncfy account"
    );
  });

  it("throws a 502 when the payload isn't an object", () => {
    expect(() => normalizeSyncfyAccount("not-an-object")).toThrow(
      "Syncfy account payload is not an object"
    );
  });

  it("throws a 502 when id_account/id is missing", () => {
    expect(() => normalizeSyncfyAccount({})).toThrow(
      "Syncfy payload is missing id_account"
    );
  });
});

describe("normalizeSyncfyInstitution", () => {
  it("derives supportedAccountTypes from products plus category, deduped", () => {
    const institution = normalizeSyncfyInstitution({
      id_site: "site-1",
      display_name: "BBVA",
      type: "bank",
      country: { code: "MX" },
      products: ["checking", "checking", "savings"]
    });

    expect(institution).toMatchObject({
      syncfyInstitutionId: "site-1",
      name: "BBVA",
      country: "MX",
      category: "bank"
    });
    expect(institution.supportedAccountTypes.sort()).toEqual(
      ["bank", "checking", "savings"].sort()
    );
  });

  it("defaults category to 'bank' when type is absent", () => {
    expect(
      normalizeSyncfyInstitution({ id_site: "s1", display_name: "X" }).category
    ).toBe("bank");
  });

  it("throws a 502 for an invalid payload", () => {
    expect(() => normalizeSyncfyInstitution(null)).toThrow(
      "Syncfy institution payload is invalid"
    );
  });
});

describe("normalizeSyncfyTransaction", () => {
  const validTransaction = {
    id_transaction: "txn-1",
    id_credential: "cred-1",
    id_account: "acc-1",
    description: "Coffee shop",
    amount: "-4.50",
    currency: "MXN",
    dt_transaction: 1700000000,
    dt_refresh: 1700000000
  };

  it("normalizes a valid transaction payload", () => {
    const transaction = normalizeSyncfyTransaction(validTransaction);

    expect(transaction).toMatchObject({
      syncfyTransactionId: "txn-1",
      syncfyCredentialId: "cred-1",
      syncfyAccountId: "acc-1",
      description: "Coffee shop",
      amount: -4.5,
      currency: "MXN"
    });
    expect(transaction.transactionDate).toBeInstanceOf(Date);
  });

  it("defaults currency to MXN when absent", () => {
    const { id_credential: _idCredential, ...rest } = validTransaction;
    expect(
      normalizeSyncfyTransaction({ ...rest, currency: undefined, id_credential: "cred-1" })
        .currency
    ).toBe("MXN");
  });

  it("uses fallbackCredentialId when id_credential is absent", () => {
    const { id_credential: _idCredential, ...rest } = validTransaction;
    expect(
      normalizeSyncfyTransaction(rest, "fallback-cred").syncfyCredentialId
    ).toBe("fallback-cred");
  });

  it("throws a 502 when neither id_credential nor a fallback is available", () => {
    const { id_credential: _idCredential, ...rest } = validTransaction;
    expect(() => normalizeSyncfyTransaction(rest)).toThrow(
      "Syncfy transaction is missing id_credential"
    );
  });

  it("throws a 502 when amount is missing", () => {
    const { amount: _amount, ...rest } = validTransaction;
    expect(() => normalizeSyncfyTransaction(rest)).toThrow(
      "Syncfy payload is missing amount"
    );
  });
});

describe("createSyncfySession", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns the token extracted from the session response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: "session-token" })
    }) as never;

    await expect(createSyncfySession("user-1")).resolves.toEqual({
      token: "session-token"
    });
  });

  it("throws a 502 when the response has no token", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({})
    }) as never;

    await expect(createSyncfySession("user-1")).rejects.toThrow(
      "Syncfy session response did not include a token"
    );
  });
});

describe("fetchSyncfyUserByExternalId", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns the first matching normalized user", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        response: { users: [{ id_user: "u1", id_external: "ext-1" }] }
      })
    }) as never;

    await expect(fetchSyncfyUserByExternalId("ext-1")).resolves.toMatchObject({
      idUser: "u1",
      externalUserId: "ext-1"
    });
  });

  it("returns undefined when no user is found", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ response: { users: [] } })
    }) as never;

    await expect(fetchSyncfyUserByExternalId("ext-1")).resolves.toBeUndefined();
  });
});

describe("createSyncfyUser", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("normalizes the created user from the response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ response: { id_user: "u2", id_external: "ext-2" } })
    }) as never;

    await expect(
      createSyncfyUser({ externalUserId: "ext-2", name: "Ada" })
    ).resolves.toMatchObject({ idUser: "u2", externalUserId: "ext-2" });
  });
});

describe("fetchSyncfyAccounts", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetches and normalizes the account list", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accounts: [{ id_account: "acc-1" }] })
    }) as never;

    const accounts = await fetchSyncfyAccounts("/v1/accounts", "tok-1");
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.syncfyAccountId).toBe("acc-1");
  });
});

describe("fetchSyncfyTransactions", () => {
  it("pages until a short page is returned, using the injected fetchPage", async () => {
    const fullPage = Array.from({ length: 2 }, (_, index) => ({
      id_transaction: `t${index}`,
      id_credential: "cred-1",
      id_account: "acc-1",
      amount: "10",
      dt_transaction: 1700000000,
      dt_refresh: 1700000000
    }));
    const shortPage = [
      {
        id_transaction: "t-last",
        id_credential: "cred-1",
        id_account: "acc-1",
        amount: "10",
        dt_transaction: 1700000000,
        dt_refresh: 1700000000
      }
    ];

    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ transactions: fullPage })
      .mockResolvedValueOnce({ transactions: shortPage });

    const transactions = await fetchSyncfyTransactions(
      "/v1/transactions",
      "tok-1",
      undefined,
      { fetchPage, limit: 2 }
    );

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(transactions).toHaveLength(3);
  });

  it("stops after the first page when it's already shorter than the limit", async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce({
      transactions: [
        {
          id_transaction: "t1",
          id_credential: "cred-1",
          id_account: "acc-1",
          amount: "10",
          dt_transaction: 1700000000,
          dt_refresh: 1700000000
        }
      ]
    });

    const transactions = await fetchSyncfyTransactions(
      "/v1/transactions",
      "tok-1",
      undefined,
      { fetchPage, limit: 500 }
    );

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(transactions).toHaveLength(1);
  });
});
