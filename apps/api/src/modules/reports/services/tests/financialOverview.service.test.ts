import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../../../currencies/services/read.service.js", () => ({
  getExchangeRate: vi.fn()
}));

const { getExchangeRate } = await import("../../../currencies/services/read.service.js");
const { getFinancialOverview } = await import("../financialOverview.service.js");
const rateMock = vi.mocked(getExchangeRate);

const dec = (n: number) => ({ toNumber: () => n });
const NOW = new Date("2026-11-10T12:00:00Z");

function account(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `Acct ${id}`,
    type: "checking",
    currency: "USD",
    initialBalance: dec(0),
    isArchived: false,
    providerAccounts: [],
    ...extra
  };
}

function tx(extra: Record<string, unknown>) {
  return {
    accountId: null,
    transferToAccountId: null,
    type: "income",
    amount: dec(0),
    executionCurrency: "USD",
    date: new Date("2026-10-15T12:00:00Z"),
    categoryId: null,
    expenseOffsetCategoryId: null,
    ...extra
  };
}

function debt(
  acceptance: "proposed" | "accepted" | "rejected",
  amount: number,
  direction: "expense" | "income",
  extra: Record<string, unknown> = {}
) {
  return {
    userId: null,
    participantName: "Ana",
    currency: "USD",
    acceptance,
    shareAmount: dec(amount),
    paidAmount: dec(0),
    settlementRequests: [],
    sharedExpense: { ownerUserId: "user-1", transaction: { type: direction, name: "Dinner" } },
    ...extra
  };
}

function seed(opts: {
  accounts?: unknown[];
  transactions?: Record<string, unknown>[];
  debts?: unknown[];
  currency?: string | null;
}) {
  prismaMock.user.findUniqueOrThrow.mockResolvedValue({
    preferredCurrency: opts.currency === undefined ? "USD" : opts.currency
  } as never);
  prismaMock.account.findMany.mockResolvedValue((opts.accounts ?? []) as never);
  prismaMock.transaction.findMany.mockResolvedValue((opts.transactions ?? []) as never);
  prismaMock.sharedExpenseParticipant.findMany.mockResolvedValue((opts.debts ?? []) as never);
}

async function overview(tz = "UTC") {
  const result = await getFinancialOverview("user-1", tz, NOW);
  if (result.netWorth.status !== "ok") throw new Error("net worth failed");
  return { ...result, netWorth: result.netWorth };
}

describe("net worth", () => {
  it("sums accounts, owed to me and I owe", async () => {
    seed({
      accounts: [account("a", { initialBalance: dec(1000) })],
      debts: [debt("accepted", 200, "expense"), debt("accepted", 50, "income")]
    });
    const { netWorth } = await overview();
    expect(netWorth).toMatchObject({ total: 1150, accounts: 1000, owedToMe: 200, iOwe: 50 });
  });

  it("scopes every query by userId", async () => {
    seed({});
    await overview();
    expect(prismaMock.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } })
    );
    expect(prismaMock.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } })
    );
  });

  it("reduces for a card debt and raises for an overpaid card", async () => {
    seed({
      accounts: [account("card", { type: "credit_card" })],
      transactions: [tx({ accountId: "card", type: "expense", amount: dec(300) })]
    });
    expect((await overview()).netWorth.total).toBe(-300);
    seed({
      accounts: [account("card", { type: "credit_card" })],
      transactions: [tx({ accountId: "card", type: "income", amount: dec(40) })]
    });
    expect((await overview()).netWorth.total).toBe(40);
  });

  it("leaves net worth unchanged by a same-currency transfer", async () => {
    seed({
      accounts: [account("a", { initialBalance: dec(500) }), account("b")],
      transactions: [tx({ accountId: "a", transferToAccountId: "b", type: "transfer", amount: dec(200) })]
    });
    const result = await overview();
    expect(result.netWorth.total).toBe(500);
    expect(result.disclosures).not.toContain("cross_currency_effects");
  });

  it("leaves net worth unchanged by a debt settlement", async () => {
    seed({
      accounts: [account("a", { initialBalance: dec(100) })],
      transactions: [tx({ accountId: "a", type: "income", amount: dec(60) })],
      debts: [debt("accepted", 100, "expense", { paidAmount: dec(60) })]
    });
    const { netWorth } = await overview();
    expect(netWorth.total).toBe(200);
  });

  it("excludes archived accounts and discloses a non-zero archived balance", async () => {
    seed({
      accounts: [account("a", { initialBalance: dec(10) }), account("z", { initialBalance: dec(99), isArchived: true })]
    });
    const result = await overview();
    expect(result.netWorth.accounts).toBe(10);
    expect(result.disclosures).toContain("archived_balance_excluded");
  });

  it("names an item with a missing rate and marks the result partial", async () => {
    rateMock.mockImplementation(async (from) => {
      if (from === "XXX") throw new Error("no rate");
      return 1;
    });
    seed({
      accounts: [account("a", { initialBalance: dec(10) }), account("x", { currency: "XXX", initialBalance: dec(5) })]
    });
    const result = await overview();
    expect(result.netWorth).toMatchObject({ partial: true, excluded: ["Acct x"], accounts: 10 });
    expect(result.disclosures).toContain("rates_missing");
  });

  it("counts only accepted shares and reports proposed ones as awaiting", async () => {
    seed({
      debts: [
        debt("accepted", 200, "expense"),
        debt("proposed", 100, "expense"),
        debt("rejected", 50, "expense"),
        debt("accepted", 30, "income"),
        debt("proposed", 7, "income")
      ]
    });
    const { netWorth } = await overview();
    expect(netWorth).toMatchObject({ owedToMe: 200, iOwe: 30, awaitingAcceptance: 2 });
  });

  it("falls back to USD without a preferred currency", async () => {
    seed({ currency: null });
    expect((await overview()).currency).toBe("USD");
  });
});

describe("savings rate", () => {
  it("computes a positive rate for the previous month", async () => {
    seed({
      transactions: [tx({ type: "income", amount: dec(1000) }), tx({ type: "expense", amount: dec(750) })]
    });
    expect((await overview()).savingsRate).toEqual({
      status: "ok",
      month: "2026-10",
      rate: 25,
      netIncome: 1000,
      netExpenses: 750
    });
  });

  it("returns a negative rate when expenses exceed income", async () => {
    seed({ transactions: [tx({ type: "income", amount: dec(100) }), tx({ type: "expense", amount: dec(150) })] });
    expect((await overview()).savingsRate).toMatchObject({ status: "ok", rate: -50 });
  });

  it("is unavailable for zero income and no_data for an empty month", async () => {
    seed({ transactions: [tx({ type: "expense", amount: dec(10) })] });
    expect((await overview()).savingsRate).toEqual({ status: "unavailable_income", month: "2026-10" });
    seed({ transactions: [] });
    expect((await overview()).savingsRate).toEqual({ status: "no_data", month: "2026-10" });
  });

  it("buckets by the supplied time zone", async () => {
    const lateOctober = tx({ type: "income", amount: dec(100), date: new Date("2026-11-01T03:00:00Z") });
    seed({ transactions: [lateOctober] });
    expect((await getFinancialOverview("user-1", "America/Mexico_City", NOW)).savingsRate).toMatchObject({
      status: "ok",
      month: "2026-10"
    });
    seed({ transactions: [lateOctober] });
    expect((await overview("UTC")).savingsRate).toEqual({ status: "no_data", month: "2026-10" });
  });

  it("selects the previous year's December in January", async () => {
    seed({});
    const result = await getFinancialOverview("user-1", "UTC", new Date("2027-01-05T00:00:00Z"));
    expect(result.savingsRate).toEqual({ status: "no_data", month: "2026-12" });
  });

  it("queries only income and expense rows, never transfers", async () => {
    seed({});
    await overview();
    expect(prismaMock.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1", type: { in: ["income", "expense"] } })
      })
    );
  });

  it("goes unavailable_rate on a missing rate while net worth stays intact", async () => {
    rateMock.mockImplementation(async (from) => {
      if (from === "XXX") throw new Error("no rate");
      return 1;
    });
    seed({
      accounts: [account("a", { initialBalance: dec(10) })],
      transactions: [tx({ type: "income", amount: dec(100), executionCurrency: "XXX" })]
    });
    const result = await overview();
    expect(result.savingsRate).toEqual({ status: "unavailable_rate", month: "2026-10" });
    expect(result.netWorth.total).toBe(10);
  });

  it("reports one metric as error without failing the other", async () => {
    seed({ accounts: [account("a", { initialBalance: dec(10) })] });
    prismaMock.transaction.findMany
      .mockResolvedValueOnce([] as never)
      .mockRejectedValueOnce(new Error("boom") as never);
    const result = await getFinancialOverview("user-1", "UTC", NOW);
    expect(result.netWorth.status).toBe("ok");
    expect(result.savingsRate).toEqual({ status: "error" });
  });
});

describe("disclosures", () => {
  it("is empty when nothing applies", async () => {
    seed({ accounts: [account("a")] });
    expect((await overview()).disclosures).toEqual([]);
  });

  it("flags investment, synced and cross-currency accounts", async () => {
    seed({
      accounts: [
        account("inv", { type: "investment" }),
        account("sync", { providerAccounts: [{ id: "p" }] }),
        account("eur", { currency: "EUR" })
      ],
      transactions: [tx({ accountId: "sync", transferToAccountId: "eur", type: "transfer", amount: dec(5) })]
    });
    rateMock.mockResolvedValue(1);
    expect((await overview()).disclosures).toEqual(
      expect.arrayContaining(["investment_recorded_balance", "synced_balances", "cross_currency_effects"])
    );
  });

  it("flags a transaction in a currency other than its account's", async () => {
    rateMock.mockResolvedValue(1);
    seed({
      accounts: [account("a")],
      transactions: [tx({ accountId: "a", type: "expense", amount: dec(5), executionCurrency: "EUR" })]
    });
    expect((await overview()).disclosures).toContain("cross_currency_effects");
  });

  it("flags past-month amounts not in the preferred currency", async () => {
    rateMock.mockResolvedValue(2);
    seed({ transactions: [tx({ type: "income", amount: dec(10), executionCurrency: "EUR" })] });
    expect((await overview()).disclosures).toContain("past_month_current_rates");
  });

  it("names a rate-less app-user debt by the live public label, not the stored snapshot", async () => {
    rateMock.mockImplementation(async (from) => {
      if (from === "XXX") throw new Error("no rate");
      return 1;
    });
    seed({
      debts: [
        debt("accepted", 20, "expense", {
          userId: "user-2",
          participantName: "Real Name",
          currency: "XXX",
          user: { id: "user-2", username: "friend", name: "Real Name", identityVisibility: "username_only" }
        })
      ]
    });
    const { netWorth } = await overview();
    expect(netWorth).toMatchObject({ excluded: ["@friend: Dinner"] });
  });
});
