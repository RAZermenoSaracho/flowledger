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
const FIAT = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" }
];
const OLD_PRICED_AT = "2020-01-01T00:00:00.000Z";

const holdingsValuation = {
  currency: "USD",
  value: "1600",
  status: "complete" as const,
  missingCount: 0,
  holdingCount: 2
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
    name: null,
    unit: null,
    quantity: "0.123456789012345678",
    manualUnitPrice: null,
    manualPriceCurrency: null,
    manualPricedAt: null,
    exchange: null,
    quoteCurrency: null,
    marketQuote: null,
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
      HttpResponse.json({
        currencies: [...FIAT],
        fiat: FIAT,
        crypto: []
      })
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

function renderPage() {
  renderWithProviders(
    <Routes>
      <Route path="/accounts/:id" element={<AccountDetailPage />} />
    </Routes>,
    { route: "/accounts/acc-1", withAuth: true }
  );
}

function captureHoldingsPatches() {
  const bodies: unknown[] = [];
  server.use(
    http.patch(`${API}/accounts/acc-1/holdings`, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json(holdingsPayload([]));
    })
  );
  return bodies;
}

describe("HoldingsTab", () => {
  it.each(["checking", "credit_card"] as const)("is not offered for a %s account", async (type) => {
    mockApi(makeAccount({ type, holdingsValuation: null }), []);
    renderPage();
    await screen.findByLabelText("Name");
    expect(screen.queryByRole("tab", { name: "Holdings" })).not.toBeInTheDocument();
  });

  it.each(["investment", "crypto"] as const)("is offered for a %s account", async (type) => {
    mockApi(makeAccount({ type }), [makeHolding()]);
    renderPage();
    expect(await screen.findByRole("tab", { name: "Holdings" })).toBeInTheDocument();
  });

  it("shows exact quantity, quoted price with Binance source and the value, with no stale cue", async () => {
    mockApi(makeAccount(), [makeHolding(), cashHolding]);
    await openHoldings(userEvent.setup());

    expect(await screen.findByLabelText("BTC quantity")).toHaveValue("0.123456789012345678");
    expect(screen.getByText("$1,500.00")).toBeInTheDocument();
    expect(screen.getByLabelText("BTC price source")).toHaveDisplayValue("Binance (automatic)");
    expect(screen.getByText("Cash · at par")).toBeInTheDocument();
    expect(screen.queryByText(/stale|outdated/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(`Last updated: ${formatValuationTime(OLD_PRICED_AT)}`).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Net deposited|Deposits and withdrawals/)).not.toBeInTheDocument();
  });

  it("stacks the timestamp as a secondary line for mobile rows", async () => {
    mockApi(makeAccount(), [makeHolding()]);
    await openHoldings(userEvent.setup());
    const label = (await screen.findAllByText(/^Last updated:/)).find((node) =>
      node.parentElement?.className.includes("sm:hidden")
    );
    expect(label).toBeDefined();
  });

  it("shows type badges only for investment accounts", async () => {
    mockApi(makeAccount(), [makeHolding(), cashHolding]);
    const user = userEvent.setup();
    await openHoldings(user);
    const row = (await screen.findByLabelText("BTC quantity")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Crypto")).toBeInTheDocument();
  });

  it("shows no type badge or selector in a crypto account", async () => {
    mockApi(makeAccount({ type: "crypto" }), [makeHolding()]);
    const user = userEvent.setup();
    await openHoldings(user);
    const row = (await screen.findByLabelText("BTC quantity")).closest("tr") as HTMLElement;
    expect(within(row).queryByText("Crypto")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add holding" }));
    expect(screen.queryByLabelText(/type$/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("New holding 2 code")).toBeInTheDocument();
  });

  it("offers the five asset types in an investment account", async () => {
    mockApi(makeAccount(), []);
    const user = userEvent.setup();
    await openHoldings(user);
    await user.click(await screen.findByRole("button", { name: "Add holding" }));
    const select = screen.getByLabelText("New holding 1 type");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Crypto",
      "Cash",
      "Stock",
      "ETF",
      "Other"
    ]);
  });

  it("requires a name for Other, accepts a unit and sends them without a code", async () => {
    mockApi(makeAccount(), []);
    const bodies = captureHoldingsPatches();
    const user = userEvent.setup();
    await openHoldings(user);
    await user.click(await screen.findByRole("button", { name: "Add holding" }));
    await user.selectOptions(screen.getByLabelText("New holding 1 type"), "other");
    await user.type(screen.getByLabelText("New holding 1 unit"), "m2");
    await user.type(screen.getByLabelText("New holding 1 quantity"), "120");
    await user.type(screen.getByLabelText("New holding 1 manual price"), "300");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a name")).toBeInTheDocument();
    expect(bodies).toHaveLength(0);

    await user.type(screen.getByLabelText("New holding 1 name"), "Land");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      upsert: [
        {
          kind: "other",
          name: "Land",
          unit: "m2",
          quantity: "120",
          manualUnitPrice: "300",
          manualPriceCurrency: "USD"
        }
      ],
      remove: []
    });
  });

  it("shows a fixed Manual source for a stock and defaults the price currency to the account currency", async () => {
    mockApi(makeAccount({ currency: "EUR" }), []);
    const user = userEvent.setup();
    await openHoldings(user);
    await user.click(await screen.findByRole("button", { name: "Add holding" }));
    await user.click(screen.getByRole("button", { name: "Enter ticker manually" }));
    expect(screen.queryByLabelText(/price source/)).not.toBeInTheDocument();
    const row = screen.getByLabelText("New holding 1 code").closest("tr") as HTMLElement;
    expect(within(row).getByText("Manual")).toBeInTheDocument();
    expect(
      await within(row).findByRole("combobox", { name: "New holding 1 manual price currency" })
    ).toHaveValue("EUR");
  });

  it("switches a saved crypto row between Binance and a manual price", async () => {
    mockApi(makeAccount({ type: "crypto" }), [makeHolding()]);
    const bodies = captureHoldingsPatches();
    const user = userEvent.setup();
    await openHoldings(user);
    await user.selectOptions(await screen.findByLabelText("BTC price source"), "manual");
    const price = screen.getByLabelText("BTC manual price");
    await user.type(price, "70000");
    expect(screen.getByRole("combobox", { name: "BTC manual price currency" })).toHaveValue("USD");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      upsert: [{ id: "h-btc", manualUnitPrice: "70000", manualPriceCurrency: "USD" }],
      remove: []
    });
  });

  it("sends manualUnitPrice null when a manual crypto row switches to Binance", async () => {
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
    mockApi(makeAccount({ type: "crypto" }), [manual]);
    const bodies = captureHoldingsPatches();
    const user = userEvent.setup();
    await openHoldings(user);
    expect(await screen.findByRole("button", { name: "Edit unit price of BTC" })).toHaveTextContent("$55,000.00");
    expect(screen.queryByLabelText("BTC manual price")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("BTC price source"), "automatic");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ upsert: [{ id: "h-btc", manualUnitPrice: null }], remove: [] });
  });

  describe("manual price editing", () => {
    const manualBtc = () =>
      makeHolding({
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

    it("shows a saved manual price as text with no input, and opens the input by click or keyboard", async () => {
      mockApi(makeAccount({ type: "crypto" }), [manualBtc()]);
      const user = userEvent.setup();
      await openHoldings(user);
      const button = await screen.findByRole("button", { name: "Edit unit price of BTC" });
      expect(screen.queryByLabelText("BTC manual price")).not.toBeInTheDocument();

      await user.click(button);
      const input = await screen.findByLabelText("BTC manual price");
      expect(input).toHaveValue("55000");
      expect(screen.getByRole("combobox", { name: "BTC manual price currency" })).toHaveValue("USD");

      await user.keyboard("{Escape}");
      expect(screen.queryByLabelText("BTC manual price")).not.toBeInTheDocument();

      screen.getByRole("button", { name: "Edit unit price of BTC" }).focus();
      await user.keyboard("{Enter}");
      expect(await screen.findByLabelText("BTC manual price")).toBeInTheDocument();
    });

    it("returns to text with the draft value on Escape and on blur", async () => {
      mockApi(makeAccount({ type: "crypto" }), [manualBtc()]);
      const user = userEvent.setup();
      await openHoldings(user);
      await user.click(await screen.findByRole("button", { name: "Edit unit price of BTC" }));
      let input = await screen.findByLabelText("BTC manual price");
      await user.clear(input);
      await user.type(input, "70000");
      await user.keyboard("{Escape}");
      expect(screen.getByRole("button", { name: "Edit unit price of BTC" })).toHaveTextContent("$70,000.00");

      await user.click(screen.getByRole("button", { name: "Edit unit price of BTC" }));
      input = await screen.findByLabelText("BTC manual price");
      await user.clear(input);
      await user.type(input, "71000");
      await user.click(screen.getByLabelText("BTC quantity"));
      expect(screen.queryByLabelText("BTC manual price")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Edit unit price of BTC" })).toHaveTextContent("$71,000.00");
    });

    it("sends the changed currency on Save and restores the saved price on Discard", async () => {
      mockApi(makeAccount({ type: "crypto" }), [manualBtc()]);
      const bodies = captureHoldingsPatches();
      const user = userEvent.setup();
      await openHoldings(user);
      await user.click(await screen.findByRole("button", { name: "Edit unit price of BTC" }));
      await user.click(await screen.findByRole("combobox", { name: "BTC manual price currency" }));
      await user.click(await screen.findByRole("option", { name: /EUR/ }));
      await user.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toEqual({
        upsert: [{ id: "h-btc", manualUnitPrice: "55000", manualPriceCurrency: "EUR" }],
        remove: []
      });
    });

    it("restores the saved price text on Discard", async () => {
      mockApi(makeAccount({ type: "crypto" }), [manualBtc()]);
      const bodies = captureHoldingsPatches();
      const user = userEvent.setup();
      await openHoldings(user);
      await user.click(await screen.findByRole("button", { name: "Edit unit price of BTC" }));
      const input = await screen.findByLabelText("BTC manual price");
      await user.clear(input);
      await user.type(input, "1");
      await user.keyboard("{Escape}");
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.getByRole("button", { name: "Edit unit price of BTC" })).toHaveTextContent("$55,000.00");
      expect(bodies).toHaveLength(0);
    });

    it("keeps an automatic price as read-only text with no edit control", async () => {
      mockApi(makeAccount({ type: "crypto" }), [makeHolding()]);
      const user = userEvent.setup();
      await openHoldings(user);
      await screen.findByLabelText("BTC quantity");
      expect(screen.getAllByText(`Last updated: ${formatValuationTime(OLD_PRICED_AT)}`).length).toBeGreaterThan(0);
      expect(screen.queryByRole("button", { name: /Edit unit price/ })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("BTC manual price")).not.toBeInTheDocument();
    });
  });

  it("opens the manual price currency picker by click and changes the currency", async () => {
    mockApi(makeAccount(), []);
    const user = userEvent.setup();
    await openHoldings(user);
    await user.click(await screen.findByRole("button", { name: "Add holding" }));
    const currency = await screen.findByRole("combobox", {
      name: "New holding 1 manual price currency"
    });
    await user.click(currency);
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: /EUR/ }));
    expect(currency).toHaveValue("EUR");
  });

  it("keeps an incompatible holding in a crypto account removable only", async () => {
    mockApi(makeAccount({ type: "crypto" }), [cashHolding]);
    const bodies = captureHoldingsPatches();
    const user = userEvent.setup();
    await openHoldings(user);
    expect(await screen.findByText(/Not allowed in a crypto account/)).toBeInTheDocument();
    expect(screen.queryByLabelText("USD quantity")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(bodies).toEqual([{ upsert: [], remove: ["h-usd"] }]));
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
    const bodies = captureHoldingsPatches();
    let accountPuts = 0;
    server.use(
      http.put(`${API}/accounts/acc-1`, () => {
        accountPuts += 1;
        return HttpResponse.json({ account: makeAccount() });
      })
    );
    const user = userEvent.setup();
    await openHoldings(user);

    const quantity = await screen.findByLabelText("BTC quantity");
    await user.clear(quantity);
    await user.type(quantity, "0.5");
    await user.click(screen.getByRole("button", { name: "Add holding" }));
    await user.selectOptions(screen.getByLabelText("New holding 2 type"), "etf");
    await user.click(screen.getByRole("button", { name: "Enter ticker manually" }));
    await user.type(screen.getByLabelText("New holding 2 code"), "voo");
    await user.type(screen.getByLabelText("VOO quantity"), "3");
    await user.type(screen.getByLabelText("VOO manual price"), "450");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      upsert: [
        { id: "h-btc", quantity: "0.5" },
        { kind: "etf", code: "VOO", quantity: "3", manualUnitPrice: "450", manualPriceCurrency: "USD" }
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
    const bodies = captureHoldingsPatches();
    const user = userEvent.setup();
    await openHoldings(user);
    const quantity = await screen.findByLabelText("BTC quantity");
    await user.clear(quantity);
    await user.type(quantity, "9");
    expect(screen.getByText("Updates on Save")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByLabelText("BTC quantity")).toHaveValue("0.123456789012345678");
    expect(bodies).toHaveLength(0);
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

  it("removes a saved row by id on Save", async () => {
    mockApi(makeAccount(), [makeHolding(), cashHolding]);
    const bodies = captureHoldingsPatches();
    const user = userEvent.setup();
    await openHoldings(user);
    const row = (await screen.findByLabelText("BTC quantity")).closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(bodies).toEqual([{ upsert: [], remove: ["h-btc"] }]));
  });
});

describe("account header", () => {
  it("shows Total value and no Net deposited or ledger balance", async () => {
    mockApi(makeAccount(), [makeHolding()]);
    renderPage();
    expect(await screen.findByText("Total value")).toBeInTheDocument();
    expect(screen.getByText("$1,600.00")).toBeInTheDocument();
    expect(screen.queryByText("Net deposited")).not.toBeInTheDocument();
    expect(screen.queryByText("$1,000.00")).not.toBeInTheDocument();
  });

  it("notes a partial value", async () => {
    mockApi(
      makeAccount({ holdingsValuation: { ...holdingsValuation, status: "partial", missingCount: 1 } }),
      [makeHolding()]
    );
    renderPage();
    expect(await screen.findByText(/Partial.*1 holding without a value/)).toBeInTheDocument();
  });

  it("notes an empty account", async () => {
    mockApi(
      makeAccount({
        holdingsValuation: { ...holdingsValuation, value: "0", status: "empty", holdingCount: 0 }
      }),
      []
    );
    renderPage();
    expect(await screen.findByText("No holdings yet")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
  });

  it("shows no holdings figures for an account without holdings", async () => {
    mockApi(makeAccount({ type: "checking", holdingsValuation: null }), []);
    renderPage();
    await screen.findByLabelText("Name");
    expect(screen.queryByText("Total value")).not.toBeInTheDocument();
  });

  describe("Twelve Data linked holdings", () => {
    const aapl = {
      symbol: "AAPL",
      name: "Apple Inc",
      exchange: "NASDAQ",
      micCode: "XNGS",
      country: "United States",
      currency: "USD",
      type: "stock" as const
    };
    const quote = {
      provider: "twelve_data" as const,
      price: "190",
      currency: "USD",
      quotedAt: "2026-11-01T15:00:00.000Z",
      checkedAt: "2026-11-01T16:00:00.000Z",
      stale: false,
      failureReason: null
    };
    const linked = makeHolding({
      id: "h-aapl",
      kind: "stock",
      code: "AAPL",
      name: "Apple Inc",
      quantity: "2",
      exchange: "XNGS",
      quoteCurrency: "USD",
      marketQuote: quote,
      valuation: {
        source: "market",
        unitPrice: "190",
        priceCurrency: "USD",
        valuedAt: quote.quotedAt,
        value: "380",
        missingReason: null
      }
    });

    function mockRefresh(holdings: Holding[]) {
      let calls = 0;
      server.use(
        http.post(`${API}/accounts/acc-1/holdings/refresh`, () => {
          calls += 1;
          return HttpResponse.json(holdingsPayload(holdings));
        })
      );
      return () => calls;
    }

    it("searches, selects, and saves the listing without a manual price", async () => {
      mockApi(makeAccount(), []);
      server.use(
        http.get(`${API}/currencies/securities`, () =>
          HttpResponse.json({ available: true, results: [aapl] })
        )
      );
      const bodies = captureHoldingsPatches();
      const user = userEvent.setup();
      await openHoldings(user);
      await user.click(await screen.findByRole("button", { name: "Add holding" }));
      await user.type(screen.getByRole("combobox", { name: "New holding 1 search" }), "aapl");
      await user.click(await screen.findByRole("option", { name: /AAPL · Apple Inc/ }));
      expect(screen.getByText("AAPL · XNGS")).toBeInTheDocument();
      expect(screen.getByLabelText("AAPL price source")).toHaveDisplayValue("Twelve Data (automatic)");
      await user.type(screen.getByLabelText("AAPL quantity"), "2");
      await user.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toEqual({
        upsert: [
          {
            kind: "stock",
            code: "AAPL",
            exchange: "XNGS",
            quoteCurrency: "USD",
            name: "Apple Inc",
            quantity: "2"
          }
        ],
        remove: []
      });
    });

    describe("duplicate listing", () => {
      const message = "This account already contains a holding for AAPL (XNGS). Edit the existing holding instead.";
      const conflictBody = {
        message,
        code: "duplicate_holding",
        holding: { kind: "stock", code: "AAPL", exchange: "XNGS" },
        issues: { formErrors: [], fieldErrors: { "upsert.0.code": [message] } }
      };

      const rowAlert = () => within(screen.getAllByText("AAPL · XNGS").at(-1)!.parentElement!).getByRole("alert");

      async function pickAapl(user: ReturnType<typeof userEvent.setup>, results = [aapl], rowNumber = 1) {
        server.use(
          http.get(`${API}/currencies/securities`, () => HttpResponse.json({ available: true, results }))
        );
        await user.click(await screen.findByRole("button", { name: "Add holding" }));
        await user.type(screen.getByRole("combobox", { name: `New holding ${rowNumber} search` }), "aapl");
        await user.click(await screen.findByRole("option", { name: /AAPL · Apple Inc/ }));
      }

      it("flags a listing the account already holds inline and blocks Save without a request", async () => {
        mockApi(makeAccount(), [linked]);
        mockRefresh([linked]);
        const bodies = captureHoldingsPatches();
        const user = userEvent.setup();
        await openHoldings(user);
        await screen.findByLabelText("AAPL quantity");
        await pickAapl(user, [aapl], 2);
        await user.type(screen.getAllByLabelText("AAPL quantity")[1]!, "1");

        await screen.findAllByText("AAPL · XNGS");
        await waitFor(() => expect(rowAlert()).toHaveTextContent(message));
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() =>
          expect(screen.getAllByRole("alert").map((el) => el.textContent)).toContain("Fix the highlighted fields to save")
        );
        expect(bodies).toHaveLength(0);
      });

      it("shows a server 409 under the right row, keeps the input and lets Save run again", async () => {
        mockApi(makeAccount(), []);
        let calls = 0;
        server.use(
          http.patch(`${API}/accounts/acc-1/holdings`, () => {
            calls += 1;
            return HttpResponse.json(conflictBody, { status: 409 });
          })
        );
        const user = userEvent.setup();
        await openHoldings(user);
        await pickAapl(user);
        await user.type(screen.getByLabelText("AAPL quantity"), "2");
        await user.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => expect(calls).toBe(1));
        await screen.findAllByText("AAPL · XNGS");
        await waitFor(() => expect(rowAlert()).toHaveTextContent(message));
        expect(screen.getByLabelText("AAPL quantity")).toHaveValue("2");
        const save = screen.getByRole("button", { name: "Save" });
        expect(save).not.toHaveAttribute("aria-busy", "true");
        expect(save).toBeDisabled();
      });

      it("succeeds on retry after changing the listing", async () => {
        mockApi(makeAccount(), []);
        const bodies: { upsert: { code: string }[] }[] = [];
        server.use(
          http.patch(`${API}/accounts/acc-1/holdings`, async ({ request }) => {
            const body = (await request.json()) as { upsert: { code: string }[] };
            bodies.push(body);
            return body.upsert[0]!.code === "AAPL"
              ? HttpResponse.json(conflictBody, { status: 409 })
              : HttpResponse.json(holdingsPayload([]));
          })
        );
        const user = userEvent.setup();
        await openHoldings(user);
        await pickAapl(user, [aapl, { ...aapl, symbol: "MSFT", name: "Microsoft" }]);
        await user.type(screen.getByLabelText("AAPL quantity"), "2");
        await user.click(screen.getByRole("button", { name: "Save" }));
        await screen.findAllByText("AAPL · XNGS");
        await waitFor(() => expect(rowAlert()).toHaveTextContent(message));

        await user.click(screen.getByRole("button", { name: "Change listing" }));
        await user.type(screen.getByRole("combobox", { name: "New holding 1 search" }), "msft");
        await user.click(await screen.findByRole("option", { name: /MSFT · Microsoft/ }));
        await user.type(screen.getByLabelText("MSFT quantity"), "1");
        const save = screen.getByRole("button", { name: "Save" });
        await waitFor(() => expect(save).toBeEnabled());
        await user.click(save);

        await waitFor(() => expect(bodies).toHaveLength(2));
        expect(bodies[1]!.upsert[0]!.code).toBe("MSFT");
      });

      it("restores the saved rows on Discard after a failed save", async () => {
        mockApi(makeAccount(), [makeHolding()]);
        server.use(
          http.patch(`${API}/accounts/acc-1/holdings`, () => HttpResponse.json(conflictBody, { status: 409 }))
        );
        const user = userEvent.setup();
        await openHoldings(user);
        await screen.findByLabelText("BTC quantity");
        await pickAapl(user, [aapl], 2);
        await user.type(screen.getByLabelText("AAPL quantity"), "2");
        await user.click(screen.getByRole("button", { name: "Save" }));
        await screen.findAllByText("AAPL · XNGS");
        await waitFor(() => expect(rowAlert()).toHaveTextContent(message));

        await user.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.queryByText("AAPL · XNGS")).not.toBeInTheDocument();
        expect(screen.queryByText(message)).not.toBeInTheDocument();
        expect(screen.getByLabelText("BTC quantity")).toBeInTheDocument();
      });
    });

    it("sets the kind from an ETF result", async () => {
      mockApi(makeAccount(), []);
      server.use(
        http.get(`${API}/currencies/securities`, () =>
          HttpResponse.json({ available: true, results: [{ ...aapl, symbol: "VOO", name: "Vanguard", type: "etf" }] })
        )
      );
      const user = userEvent.setup();
      await openHoldings(user);
      await user.click(await screen.findByRole("button", { name: "Add holding" }));
      await user.type(screen.getByRole("combobox", { name: "New holding 1 search" }), "voo");
      await user.click(await screen.findByRole("option", { name: /VOO/ }));
      expect(screen.getByLabelText("VOO type")).toHaveValue("etf");
    });

    it("refreshes linked holdings once on mount and shows the fresh quote", async () => {
      mockApi(makeAccount(), [linked]);
      const fresh = {
        ...linked,
        marketQuote: { ...quote, stale: true, failureReason: "unavailable" as const }
      };
      const calls = mockRefresh([fresh]);
      const user = userEvent.setup();
      await openHoldings(user);
      expect(await screen.findByText("Stale")).toBeInTheDocument();
      await user.type(screen.getByLabelText("AAPL quantity"), "5");
      expect(calls()).toBe(1);
      expect(screen.getAllByText(`Last checked: ${formatValuationTime(quote.checkedAt)}`).length).toBeGreaterThan(0);
    });

    it("labels Twelve Data without claiming real time and does not refresh unlinked holdings", async () => {
      mockApi(makeAccount(), [linked, makeHolding()]);
      const calls = mockRefresh([linked]);
      await openHoldings(userEvent.setup());
      expect(await screen.findByText(/may be delayed or end-of-day/)).toBeInTheDocument();
      expect(screen.queryByText(/real-time/i)).not.toBeInTheDocument();
      expect(screen.getByText("Apple Inc")).toBeInTheDocument();
      await waitFor(() => expect(calls()).toBe(1));
    });

    it("does not call refresh when no holding is linked", async () => {
      mockApi(makeAccount(), [makeHolding()]);
      const calls = mockRefresh([]);
      await openHoldings(userEvent.setup());
      await screen.findByLabelText("BTC quantity");
      expect(calls()).toBe(0);
    });

    it("explains a linked holding with no market price", async () => {
      const missing = {
        ...linked,
        valuation: { ...linked.valuation, unitPrice: null, priceCurrency: null, value: null, missingReason: "price_unavailable" as const }
      };
      mockApi(makeAccount(), [missing]);
      mockRefresh([missing]);
      await openHoldings(userEvent.setup());
      expect(await screen.findByText("Market price unavailable; set a manual price")).toBeInTheDocument();
    });

    it("sends only the quantity when a linked holding is edited", async () => {
      mockApi(makeAccount(), [linked]);
      mockRefresh([linked]);
      const bodies = captureHoldingsPatches();
      const user = userEvent.setup();
      await openHoldings(user);
      const quantity = await screen.findByLabelText("AAPL quantity");
      await user.clear(quantity);
      await user.type(quantity, "3");
      await user.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toEqual({ upsert: [{ id: "h-aapl", quantity: "3" }], remove: [] });
    });
  });
});
