import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../../../utils/httpError.js";
import type { McpAuth } from "../../types/mcp.types.js";

vi.mock("../../../debts/services/read.service.js", () => ({ listDebts: vi.fn() }));
vi.mock("../../../currencies/services/read.service.js", () => ({ getExchangeRate: vi.fn(), listCurrencies: vi.fn() }));
vi.mock("../../../notifications/services/read.service.js", () => ({
  listNotifications: vi.fn(),
  countUnreadNotifications: vi.fn()
}));
vi.mock("../../../users/services/read.service.js", () => ({ getCurrentUser: vi.fn() }));
vi.mock("../../../reports/services/read.service.js", () => ({
  getSummaryReport: vi.fn(),
  getByCategoryReport: vi.fn(),
  getMonthlyCashflowReport: vi.fn()
}));
vi.mock("../../../transactions/services/read.service.js", () => ({
  listImportedTransactions: vi.fn(),
  getTransactionById: vi.fn()
}));

const { listDebts } = await import("../../../debts/services/read.service.js");
const { getExchangeRate, listCurrencies } = await import("../../../currencies/services/read.service.js");
const { listNotifications, countUnreadNotifications } = await import("../../../notifications/services/read.service.js");
const { getCurrentUser } = await import("../../../users/services/read.service.js");
const { getSummaryReport, getByCategoryReport, getMonthlyCashflowReport } = await import(
  "../../../reports/services/read.service.js"
);
const { listImportedTransactions, getTransactionById } = await import("../../../transactions/services/read.service.js");
const { registerPersonalReadTools } = await import("../tools.reads.controller.js");

type Handler = (args: Record<string, unknown>) => Promise<{
  isError?: boolean;
  structuredContent?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  content: { text: string }[];
}>;

const auth = { token: "t", clientId: "k1", scopes: ["read"], extra: { userId: "u1", kind: "apiKey" } } as McpAuth;
const tools = new Map<string, { config: Record<string, unknown>; handler: Handler }>();
registerPersonalReadTools(
  { registerTool: (n: string, config: Record<string, unknown>, handler: Handler) => tools.set(n, { config, handler }) } as never,
  auth
);
const run = (name: string, args: Record<string, unknown> = {}) => tools.get(name)!.handler(args);

beforeEach(() => vi.clearAllMocks());

describe("registerPersonalReadTools", () => {
  it("registers eight read-only tools", () => {
    expect([...tools.keys()]).toEqual([
      "list_debts",
      "get_report",
      "get_exchange_rate",
      "list_notifications",
      "get_transaction",
      "list_currencies",
      "get_profile",
      "list_imported_transactions"
    ]);
    for (const { config } of tools.values()) expect(config.annotations).toEqual({ readOnlyHint: true });
  });

  it("list_debts caps each list at 100 and reports totals", async () => {
    vi.mocked(listDebts).mockResolvedValue({ iOwe: Array.from({ length: 120 }, (_, i) => i), owedToMe: [] } as never);
    const result = await run("list_debts");

    expect(listDebts).toHaveBeenCalledWith("u1");
    expect(result.structuredContent!.iOwe).toHaveLength(100);
    expect(result.structuredContent!.totals).toEqual({ iOwe: 120, owedToMe: 0 });
  });

  it.each([
    ["summary", getSummaryReport],
    ["by_category", getByCategoryReport],
    ["monthly_cashflow", getMonthlyCashflowReport]
  ])("get_report %s calls the matching report service with the filters", async (type, service) => {
    vi.mocked(service as typeof getSummaryReport).mockResolvedValue({ currency: "USD" } as never);
    const result = await run("get_report", { type, dateFrom: "2024-01-01" });

    expect(service).toHaveBeenCalledWith("u1", expect.objectContaining({ dateFrom: "2024-01-01" }));
    expect(result.structuredContent).toEqual({ currency: "USD" });
  });

  it("get_exchange_rate returns from, to and rate", async () => {
    vi.mocked(getExchangeRate).mockResolvedValue(17.5);
    expect((await run("get_exchange_rate", { from: "USD", to: "MXN" })).structuredContent).toEqual({
      from: "USD",
      to: "MXN",
      rate: 17.5
    });
  });

  it("list_notifications lists for the credential's user with the full unread count", async () => {
    vi.mocked(listNotifications).mockResolvedValue([{ id: "n1" }] as never);
    vi.mocked(countUnreadNotifications).mockResolvedValue(7);
    expect((await run("list_notifications")).structuredContent).toEqual({
      notifications: [{ id: "n1" }],
      unreadCount: 7
    });
    expect(listNotifications).toHaveBeenCalledWith("u1");
    expect(countUnreadNotifications).toHaveBeenCalledWith("u1");
  });

  it("get_transaction fetches by id for the credential's user and maps not-found to isError", async () => {
    vi.mocked(getTransactionById).mockResolvedValueOnce({ id: "t1" } as never);
    expect((await run("get_transaction", { id: "t1" })).structuredContent).toEqual({ transaction: { id: "t1" } });
    expect(getTransactionById).toHaveBeenCalledWith("u1", "t1");

    vi.mocked(getTransactionById).mockRejectedValueOnce(new HttpError(404, "Transaction not found"));
    expect((await run("get_transaction", { id: "x" })).isError).toBe(true);
  });

  it("list_currencies returns the currency lists", async () => {
    vi.mocked(listCurrencies).mockResolvedValue({ currencies: ["USD"], fiat: ["USD"], crypto: [] } as never);
    expect((await run("list_currencies")).structuredContent).toEqual({ currencies: ["USD"], fiat: ["USD"], crypto: [] });
  });

  it("get_profile returns the user without passwordHash", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", name: "Ada", passwordHash: "secret" } as never);
    const result = await run("get_profile");

    expect(getCurrentUser).toHaveBeenCalledWith("u1");
    expect(result.structuredContent).toEqual({ user: { id: "u1", name: "Ada" } });
  });

  it("list_imported_transactions caps at 100, keeps the total and filters by status", async () => {
    vi.mocked(listImportedTransactions).mockResolvedValue({
      importedTransactions: Array.from({ length: 250 }, (_, i) => ({ id: String(i) })),
      total: 250,
      pendingCount: 3
    } as never);
    const result = await run("list_imported_transactions", { status: "pending" });

    expect(listImportedTransactions).toHaveBeenCalledWith(
      "u1",
      JSON.stringify({ where: { field: "status", op: "=", value: "pending" } })
    );
    expect(result.structuredContent!.importedTransactions).toHaveLength(100);
    expect(result.structuredContent).toMatchObject({ total: 250, pendingCount: 3 });
  });

  it("maps service errors to isError results", async () => {
    vi.mocked(listDebts).mockRejectedValue(new HttpError(500, "boom"));
    expect((await run("list_debts")).isError).toBe(true);
  });
});
