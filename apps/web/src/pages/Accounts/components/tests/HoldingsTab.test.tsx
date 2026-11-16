import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AccountHoldings, Holding } from "@flowledger/shared";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Account } from "../../../../types/accounts.types";
import { formatValuationTime } from "../../../../utils/dateTime";
import { AccountDetailPage } from "../../AccountDetailPage";

vi.mock("../../utils/syncfyWidget", () => ({ openSyncfyWidget: vi.fn() }));

const API = "http://localhost:4000";
const OLD_PRICED_AT = "2020-01-01T00:00:00.000Z";

const holdingsValuation = {
  currency: "USD",
  value: "1600",
  status: "complete" as const,
  missingCount: 0,
  netDeposited: "1000"
};

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc-1",
    name: "Broker",
    type: "investment",
    currency: "USD",
    initialBalance: "0",
    currentBalance: "1000",
    isArchived: false,
    source: "manual",
    holdingsValuation,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: "h-btc",
    accountId: "acc-1",
    kind: "crypto",
    code: "BTC",
    quantity: "0.123456789012345678",
    manualUnitPrice: null,
    manualPriceCurrency: null,
    manualPricedAt: null,
    valuation: {
      source: "market",
      unitPrice: "60000",
      priceCurrency: "USDT",
      valuedAt: OLD_PRICED_AT,
      value: "1500",
      missingReason: null
    },
    ...overrides
  };
}

const cashHolding = makeHolding({
  id: "h-usd",
  kind: "fiat",
  code: "USD",
  quantity: "100",
  valuation: {
    source: "cash",
    unitPrice: "1",
    priceCurrency: "USD",
    valuedAt: null,
    value: "100",
    missingReason: null
  }
});

function holdingsPayload(holdings: Holding[]): AccountHoldings {
  return { accountId: "acc-1", holdings, valuation: holdingsValuation };
}

function mockApi(account: Account, holdings: Holding[]) {
  server.use(
    http.post(`${API}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    http.get(`${API}/accounts`, () => HttpResponse.json({ accounts: [account] })),
    http.get(`${API}/accounts/acc-1/holdings`, () =>
      HttpResponse.json(holdingsPayload(holdings))
    ),
    http.get(`${API}/currencies`, () =>
      HttpResponse.json({ currencies: [], fiat: [], crypto: [] })
    ),
    http.get(`${API}/providers/connectors`, () => HttpResponse.json({ connectors: [] })),
    http.get(`${API}/providers/accounts`, () => HttpResponse.json({ accounts: [] }))
  );
}

async function openHoldings(user: ReturnType<typeof userEvent.setup>) {
  renderWithProviders(
    <Routes>
      <Route path="/accounts/:id" element={<AccountDetailPage />} />
    </Routes>,
    { route: "/accounts/acc-1", withAuth: true }
  );
  await user.click(await screen.findByRole("tab", { name: "Holdings" }));
}

describe("HoldingsTab", () => {
  it.each(["checking", "credit_card"] as const)("is not offered for a %s account", async (type) => {
    mockApi(makeAccount({ type, holdingsValuation: null }), []);
    renderWithProviders(
      <Routes>
        <Route path="/accounts/:id" element={<AccountDetailPage />} />
      </Routes>,
      { route: "/accounts/acc-1", withAuth: true }
    );
    await screen.findByLabelText("Name");
    expect(screen.queryByRole("tab", { name: "Holdings" })).not.toBeInTheDocument();
  });

  it.each(["investment", "crypto"] as const)("is offered for a %s account", async (type) => {
    mockApi(makeAccount({ type }), [makeHolding()]);
    renderWithProviders(
      <Routes>
        <Route path="/accounts/:id" element={<AccountDetailPage />} />
      </Routes>,
      { route: "/accounts/acc-1", withAuth: true }
    );
    expect(await screen.findByRole("tab", { name: "Holdings" })).toBeInTheDocument();
  });

  it("shows exact quantity, price, value, sources and no stale cue for an old price", async () => {
    mockApi(makeAccount(), [makeHolding(), cashHolding]);
    await openHoldings(userEvent.setup());

    expect(await screen.findByLabelText("BTC quantity")).toHaveValue("0.123456789012345678");
    expect(screen.getByText("$1,500.00")).toBeInTheDocument();
    expect(screen.getByText("Market (Binance, USDT = USD)")).toBeInTheDocument();
    expect(screen.getByText("Cash", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Net deposited")).toBeInTheDocument();
    expect(screen.getByText("$1,600.00")).toBeInTheDocument();
    expect(screen.queryByText(/stale|outdated/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(`Last updated: ${formatValuationTime(OLD_PRICED_AT)}`).length).toBeGreaterThan(0);
    expect(screen.getByText(/Deposits and withdrawals change/)).toBeInTheDocument();
  });

  it("stacks the timestamp as a secondary line for mobile rows", async () => {
    mockApi(makeAccount(), [makeHolding()]);
    await openHoldings(userEvent.setup());
    const label = (await screen.findAllByText(/^Last updated:/)).find((node) =>
      node.parentElement?.className.includes("sm:hidden")
    );
    expect(label).toBeDefined();
  });

  it("reads Value missing with its reason, never 0", async () => {
    const missing = makeHolding({
      code: "FOO",
      valuation: {
        source: null,
        unitPrice: null,
        priceCurrency: null,
        valuedAt: null,
        value: null,
        missingReason: "unsupported"
      }
    });
    mockApi(
      makeAccount({ holdingsValuation: { ...holdingsValuation, value: "0", status: "partial", missingCount: 1 } }),
      [missing]
    );
    await openHoldings(userEvent.setup());

    expect(await screen.findByText("Value missing")).toBeInTheDocument();
    expect(screen.getByText(/No market price exists/)).toBeInTheDocument();
    const row = screen.getByText("Value missing").closest("tr") as HTMLElement;
    expect(within(row).queryByText(/\$0\.00/)).not.toBeInTheDocument();
    expect(within(row).queryByText(/Last updated/)).not.toBeInTheDocument();
  });

  it("sends one change set on Save for an added row and an edited quantity", async () => {
    mockApi(makeAccount(), [makeHolding()]);
    const bodies: unknown[] = [];
    let accountPuts = 0;
    server.use(
      http.put(`${API}/accounts/acc-1`, () => {
        accountPuts += 1;
        return HttpResponse.json({ account: makeAccount() });
      }),
      http.patch(`${API}/accounts/acc-1/holdings`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(holdingsPayload([makeHolding({ quantity: "0.5" })]));
      })
    );
    const user = userEvent.setup();
    await openHoldings(user);

    const quantity = await screen.findByLabelText("BTC quantity");
    await user.clear(quantity);
    await user.type(quantity, "0.5");
    await user.click(screen.getByRole("button", { name: "Add holding" }));
    await user.selectOptions(screen.getByLabelText("New holding 2 kind"), "fiat");
    await user.type(screen.getByLabelText("New holding 2 code"), "usd");
    await user.type(screen.getByLabelText("USD quantity"), "200");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      upsert: [
        { id: "h-btc", quantity: "0.5" },
        { kind: "fiat", code: "USD", quantity: "200" }
      ],
      remove: []
    });
    expect(accountPuts).toBe(0);
  });

  it("keeps the draft and shows the error when the holdings PATCH fails", async () => {
    mockApi(makeAccount(), [makeHolding()]);
    server.use(
      http.patch(`${API}/accounts/acc-1/holdings`, () =>
        HttpResponse.json({ message: "Holdings rejected" }, { status: 400 })
      )
    );
    const user = userEvent.setup();
    await openHoldings(user);
    const quantity = await screen.findByLabelText("BTC quantity");
    await user.clear(quantity);
    await user.type(quantity, "2");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/Holdings rejected/)).toBeInTheDocument();
    expect(screen.getByLabelText("BTC quantity")).toHaveValue("2");
  });

  it("restores the original quantity on Discard and sends nothing", async () => {
    mockApi(makeAccount(), [makeHolding()]);
    let patched = false;
    server.use(
      http.patch(`${API}/accounts/acc-1/holdings`, () => {
        patched = true;
        return HttpResponse.json(holdingsPayload([]));
      })
    );
    const user = userEvent.setup();
    await openHoldings(user);
    const quantity = await screen.findByLabelText("BTC quantity");
    await user.clear(quantity);
    await user.type(quantity, "9");
    expect(screen.getByText("Updates on Save")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByLabelText("BTC quantity")).toHaveValue("0.123456789012345678");
    expect(patched).toBe(false);
  });

  it("shows inline precision errors", async () => {
    mockApi(makeAccount(), [cashHolding]);
    const user = userEvent.setup();
    await openHoldings(user);
    const quantity = await screen.findByLabelText("USD quantity");
    await user.clear(quantity);
    await user.type(quantity, "1.234");
    expect(await screen.findByText("USD allows at most 2 decimal places")).toBeInTheDocument();
  });

  it("clears a manual price by sending null", async () => {
    const manual = makeHolding({
      manualUnitPrice: "55000",
      manualPriceCurrency: "USD",
      manualPricedAt: OLD_PRICED_AT,
      valuation: {
        source: "manual",
        unitPrice: "55000",
        priceCurrency: "USD",
        valuedAt: OLD_PRICED_AT,
        value: "1400",
        missingReason: null
      }
    });
    mockApi(makeAccount(), [manual]);
    const bodies: unknown[] = [];
    server.use(
      http.patch(`${API}/accounts/acc-1/holdings`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(holdingsPayload([makeHolding()]));
      })
    );
    const user = userEvent.setup();
    await openHoldings(user);
    expect(await screen.findByText("Manual")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear manual price for BTC" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ upsert: [{ id: "h-btc", manualUnitPrice: null }], remove: [] });
  });

  it("removes a saved row by id on Save", async () => {
    mockApi(makeAccount(), [makeHolding(), cashHolding]);
    const bodies: unknown[] = [];
    server.use(
      http.patch(`${API}/accounts/acc-1/holdings`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(holdingsPayload([cashHolding]));
      })
    );
    const user = userEvent.setup();
    await openHoldings(user);
    const row = (await screen.findByLabelText("BTC quantity")).closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(bodies).toEqual([{ upsert: [], remove: ["h-btc"] }]));
  });
});

describe("account header", () => {
  it("shows the aggregate labeled Partial next to Net deposited", async () => {
    mockApi(
      makeAccount({ holdingsValuation: { ...holdingsValuation, status: "partial", missingCount: 1 } }),
      [makeHolding()]
    );
    renderWithProviders(
      <Routes>
        <Route path="/accounts/:id" element={<AccountDetailPage />} />
      </Routes>,
      { route: "/accounts/acc-1", withAuth: true }
    );
    expect(await screen.findByText("Partial")).toBeInTheDocument();
    expect(screen.getByText("Holdings value", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Net deposited")).toBeInTheDocument();
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
  });

  it("shows no holdings figures for an account without holdings", async () => {
    mockApi(makeAccount({ type: "checking", holdingsValuation: null }), []);
    renderWithProviders(
      <Routes>
        <Route path="/accounts/:id" element={<AccountDetailPage />} />
      </Routes>,
      { route: "/accounts/acc-1", withAuth: true }
    );
    await screen.findByLabelText("Name");
    expect(screen.queryByText("Net deposited")).not.toBeInTheDocument();
  });
});
