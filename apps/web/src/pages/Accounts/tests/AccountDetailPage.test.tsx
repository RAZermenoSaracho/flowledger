import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../tests/mocks/server";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import type { Account } from "../../../types/accounts.types";
import { AccountDetailPage } from "../AccountDetailPage";

vi.mock("../utils/syncfyWidget", () => ({ openSyncfyWidget: vi.fn() }));

const API_URL = "http://localhost:4000";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc-1",
    name: "Checking",
    type: "checking",
    identifier: "1234",
    currency: "USD",
    initialBalance: "500",
    currentBalance: "500",
    isArchived: false,
    source: "manual",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

function mockAccounts(accounts: Account[]) {
  server.use(
    http.post(
      `${API_URL}/auth/refresh`,
      () => new HttpResponse(null, { status: 401 })
    ),
    http.get(`${API_URL}/accounts`, () => HttpResponse.json({ accounts })),
    http.get(`${API_URL}/currencies`, () =>
      HttpResponse.json({ currencies: [], fiat: [], crypto: [] })
    ),
    http.get(`${API_URL}/providers/connectors`, () =>
      HttpResponse.json({
        connectors: [
          {
            provider: "syncfy",
            connectorId: "c1",
            title: "Bank",
            description: "d",
            country: "US",
            category: "bank",
            coverageLabel: "Popular"
          }
        ]
      })
    ),
    http.get(`${API_URL}/providers/accounts`, () =>
      HttpResponse.json({ accounts: [] })
    )
  );
}

function renderPage(id = "acc-1") {
  return renderWithProviders(
    <Routes>
      <Route path="/accounts/:id" element={<AccountDetailPage />} />
      <Route path="/accounts" element={<p>Accounts list</p>} />
    </Routes>,
    { route: `/accounts/${id}`, withAuth: true }
  );
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("AccountDetailPage", () => {
  it("renders the account with directly editable fields and no Edit button", async () => {
    mockAccounts([makeAccount()]);
    renderPage();

    expect(await screen.findByLabelText("Name")).toHaveValue("Checking");
    expect(screen.getByLabelText("Type")).toHaveValue("checking");
    expect(
      screen.getByRole("option", { name: "Checking / debit" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Identifier")).toHaveValue("1234");
    expect(screen.getByLabelText("Initial balance")).toHaveValue(500);
    expect(
      screen.queryByRole("button", { name: "Edit" })
    ).not.toBeInTheDocument();
  });

  it("offers General and Transactions tabs", async () => {
    mockAccounts([makeAccount()]);
    server.use(
      http.get(`${API_URL}/transactions`, () =>
        HttpResponse.json({
          data: [],
          meta: {
            total: 0,
            page: 1,
            pageSize: 20,
            pageCount: 0,
            hasNext: false,
            hasPrevious: false,
            executionTime: 1
          }
        })
      )
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText("Name");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "General",
      "Transactions"
    ]);
    await user.click(screen.getByRole("tab", { name: "Transactions" }));
    expect(
      await screen.findByText("No transactions for this account yet.")
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  describe("Transactions tab SearchBar", () => {
    const START = "2026-09-21T06:00:00.000Z";
    const END = "2026-10-21T06:00:00.000Z";
    const PERIOD_ROUTE = `/accounts/acc-1?tab=transactions&periodFrom=2026-09-21&periodTo=2026-10-20&periodStartAt=${START}&periodEndAt=${END}`;
    const PERIOD_CHIP = "Billing period Sep 21, 2026 – Oct 20, 2026";
    const scope = { field: "accountId", op: "=", value: "acc-1" };
    const periodWhere = {
      and: [
        { field: "date", op: ">=", value: START },
        { field: "date", op: "<", value: END }
      ]
    };
    const withTransfers = {
      or: [scope, { field: "transferToAccountId", op: "=", value: "acc-1" }]
    };

    function setup(route: string, type: Account["type"] = "credit_card") {
      mockAccounts([
        makeAccount({ type, billingTimeZone: "America/Mexico_City" })
      ]);
      const wheres: unknown[] = [];
      server.use(
        http.get(`${API_URL}/groups`, () => HttpResponse.json({ groups: [] })),
        http.get(`${API_URL}/categories`, () =>
          HttpResponse.json({ categories: [] })
        ),
        http.get(`${API_URL}/transactions`, ({ request }) => {
          wheres.push(
            JSON.parse(new URL(request.url).searchParams.get("query")!).where
          );
          return HttpResponse.json({
            data: [],
            meta: { total: 0, hasNext: false }
          });
        })
      );
      function Probe() {
        const location = useLocation();
        const navigate = useNavigate();
        return (
          <>
            <output aria-label="search">{location.search}</output>
            <button
              onClick={() =>
                navigate(
                  "/accounts/acc-1?tab=transactions&periodFrom=2026-10-21&periodTo=2026-11-20&periodStartAt=2026-10-21T06:00:00.000Z&periodEndAt=2026-11-21T06:00:00.000Z"
                )
              }
            >
              go next period
            </button>
            <button onClick={() => navigate(-1)}>go back</button>
          </>
        );
      }
      renderWithProviders(
        <>
          <Probe />
          <Routes>
            <Route path="/accounts/:id" element={<AccountDetailPage />} />
          </Routes>
        </>,
        { route, withAuth: true }
      );
      return wheres;
    }

    it("offers the full transaction fields, without Billing period in the picker", async () => {
      setup(PERIOD_ROUTE.split("&period")[0]!);
      const user = userEvent.setup();
      await screen.findByLabelText("Search transactions");
      await user.click(
        screen.getByRole("button", { name: "Filter, group, and sort" })
      );
      await user.click(screen.getByRole("button", { name: "Edit filters" }));
      await user.click(screen.getByRole("button", { name: "+ Condition" }));
      const options = Array.from(
        screen.getByLabelText("Field").querySelectorAll("option")
      ).map((option) => option.textContent);
      expect(options).toEqual(
        expect.arrayContaining(["Amount", "Category", "Date", "Type"])
      );
      expect(options).not.toContain("Billing period");
    });

    it("shows the period as a chip and queries its exact instants, including transfers in", async () => {
      const wheres = setup(PERIOD_ROUTE);
      expect(await screen.findByText(PERIOD_CHIP)).toBeInTheDocument();
      expect(screen.queryByText("Active filter:")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(wheres.at(-1)).toEqual({ and: [withTransfers, periodWhere] })
      );
    });

    it("ANDs the period with another condition", async () => {
      const wheres = setup(PERIOD_ROUTE);
      const user = userEvent.setup();
      await screen.findByText(PERIOD_CHIP);
      await user.type(
        screen.getByLabelText("Search transactions"),
        "coffee{Enter}"
      );
      await waitFor(() =>
        expect(JSON.stringify(wheres.at(-1))).toContain('"value":"coffee"')
      );
      expect(JSON.stringify(wheres.at(-1))).toContain(START);
      expect(JSON.stringify(wheres.at(-1))).toContain("transferToAccountId");
    });

    it("removing the chip clears the period URL params, keeps other filters and drops the transfer widening", async () => {
      const wheres = setup(PERIOD_ROUTE);
      const user = userEvent.setup();
      await screen.findByText(PERIOD_CHIP);
      await user.type(
        screen.getByLabelText("Search transactions"),
        "coffee{Enter}"
      );
      await waitFor(() =>
        expect(JSON.stringify(wheres.at(-1))).toContain('"value":"coffee"')
      );

      await user.click(
        screen.getByRole("button", { name: `Remove ${PERIOD_CHIP} filter` })
      );
      await waitFor(() =>
        expect(screen.getByLabelText("search")).toHaveTextContent(
          "?tab=transactions"
        )
      );
      expect(screen.getByLabelText("search")).not.toHaveTextContent("period");
      await waitFor(() =>
        expect(wheres.at(-1)).toEqual({
          and: [scope, { field: "name", op: "ilike", value: "coffee" }]
        })
      );
      expect(screen.queryByText(PERIOD_CHIP)).not.toBeInTheDocument();
      expect(screen.getByText("Name contains coffee")).toBeInTheDocument();
    });

    it("restores the chip from the URL on a fresh render", async () => {
      setup(PERIOD_ROUTE);
      expect(await screen.findByText(PERIOD_CHIP)).toBeInTheDocument();
    });

    it("remounts with the new period on an external URL change and back", async () => {
      const wheres = setup(PERIOD_ROUTE);
      const user = userEvent.setup();
      await screen.findByText(PERIOD_CHIP);
      await user.click(screen.getByRole("button", { name: "go next period" }));
      expect(
        await screen.findByText("Billing period Oct 21, 2026 – Nov 20, 2026")
      ).toBeInTheDocument();
      expect(screen.queryByText(PERIOD_CHIP)).not.toBeInTheDocument();
      await waitFor(() =>
        expect(JSON.stringify(wheres.at(-1))).toContain(
          "2026-11-21T06:00:00.000Z"
        )
      );

      await user.click(screen.getByRole("button", { name: "go back" }));
      expect(await screen.findByText(PERIOD_CHIP)).toBeInTheDocument();
    });
  });

  it("saves edits in one request", async () => {
    mockAccounts([makeAccount()]);
    let body: unknown;
    server.use(
      http.put(`${API_URL}/accounts/acc-1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          account: makeAccount({ name: "New name" })
        });
      })
    );
    const user = userEvent.setup();
    renderPage();

    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "New name");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(body).toEqual({ name: "New name" }));
  });

  it("shows a validation error and discards changes", async () => {
    mockAccounts([makeAccount()]);
    const user = userEvent.setup();
    renderPage();

    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveValue("Checking")
    );
  });

  it("shows not-found for an unknown or foreign id", async () => {
    mockAccounts([makeAccount()]);
    renderPage("other-id");

    expect(await screen.findByText("Account not found")).toBeInTheDocument();
    expect(screen.queryByText("Checking")).not.toBeInTheDocument();
  });

  it("shows the sync panel for a synced account", async () => {
    mockAccounts([
      makeAccount({
        source: "synced",
        sync: [
          {
            id: "sync-1",
            provider: "syncfy",
            providerCredentialId: "cred-1",
            providerAccountId: "pa-1",
            status: "active",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
          }
        ]
      })
    ]);
    renderPage();

    expect(
      await screen.findByRole("button", { name: /resync/i })
    ).toBeInTheDocument();
  });

  it("archives an active account", async () => {
    mockAccounts([makeAccount()]);
    let archived = false;
    server.use(
      http.post(`${API_URL}/accounts/acc-1/archive`, () => {
        archived = true;
        return HttpResponse.json({
          account: makeAccount({ isArchived: true })
        });
      })
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Record actions" })
    );
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));
    await waitFor(() => expect(archived).toBe(true));
  });

  it("offers Restore for an archived account", async () => {
    mockAccounts([makeAccount({ isArchived: true })]);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Record actions" })
    );
    expect(
      screen.getByRole("menuitem", { name: "Restore" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Archive" })
    ).not.toBeInTheDocument();
  });

  it("deletes after confirmation and returns to the list", async () => {
    mockAccounts([makeAccount()]);
    server.use(
      http.delete(
        `${API_URL}/accounts/acc-1`,
        () => new HttpResponse(null, { status: 204 })
      )
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Record actions" })
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(await screen.findByText("Accounts list")).toBeInTheDocument();
  });

  it("renders a credit card whose API payload has numeric card amounts", async () => {
    mockAccounts([
      makeAccount({
        type: "credit_card",
        creditLimit: 48000,
        annualInterestRate: 60
      } as unknown as Partial<Account>)
    ]);
    renderPage();

    expect(await screen.findByLabelText("Credit limit")).toHaveValue(48000);
    expect(screen.getByLabelText("Annual interest rate (%)")).toHaveValue(60);
    expect(
      screen.getByRole("tab", { name: "Credit card" })
    ).toBeInTheDocument();
  });

  describe("Initial balance by type", () => {
    it.each(["investment", "crypto"] as const)("is hidden for a %s account", async (type) => {
      mockAccounts([makeAccount({ type })]);
      renderPage();
      await screen.findByLabelText("Name");
      expect(screen.queryByLabelText("Initial balance")).not.toBeInTheDocument();
    });

    it.each(["checking", "credit_card"] as const)("is shown for a %s account", async (type) => {
      mockAccounts([makeAccount({ type })]);
      renderPage();
      expect(await screen.findByLabelText("Initial balance")).toHaveValue(500);
    });

    it("hides when the type switches to investment and reappears with the stored value", async () => {
      mockAccounts([makeAccount()]);
      const user = userEvent.setup();
      renderPage();
      await screen.findByLabelText("Initial balance");
      await user.selectOptions(screen.getByLabelText("Type"), "investment");
      expect(screen.queryByLabelText("Initial balance")).not.toBeInTheDocument();
      await user.selectOptions(screen.getByLabelText("Type"), "checking");
      expect(screen.getByLabelText("Initial balance")).toHaveValue(500);
    });

    it("is hidden on create for a holding type and the request sends 0", async () => {
      mockAccounts([]);
      const bodies: unknown[] = [];
      server.use(
        http.post(`${API_URL}/accounts`, async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json({ account: makeAccount({ id: "new-1" }) }, { status: 201 });
        })
      );
      const user = userEvent.setup();
      renderWithProviders(
        <Routes>
          <Route path="/accounts/new" element={<AccountDetailPage />} />
          <Route path="/accounts/:id" element={<p>Opened</p>} />
        </Routes>,
        { route: "/accounts/new", withAuth: true }
      );
      await user.type(await screen.findByLabelText("Name"), "Broker");
      expect(screen.getByLabelText("Initial balance")).toBeInTheDocument();
      await user.selectOptions(screen.getByLabelText("Type"), "investment");
      expect(screen.queryByLabelText("Initial balance")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toMatchObject({ type: "investment", initialBalance: "0" });
    });
  });

  describe("Net contributions", () => {
    const contributions = {
      currency: "USD",
      incoming: "1500",
      outgoing: "300",
      net: "1200",
      transferCount: 3,
      excludedCount: 0
    };

    async function openTransactions(account: Account) {
      mockAccounts([account]);
      server.use(
        http.get(`${API_URL}/transactions`, () =>
          HttpResponse.json({
            data: [],
            meta: { total: 0, page: 1, pageSize: 20, pageCount: 0, hasNext: false, hasPrevious: false, executionTime: 1 }
          })
        ),
        http.get(`${API_URL}/groups`, () => HttpResponse.json({ groups: [] })),
        http.get(`${API_URL}/categories`, () => HttpResponse.json({ categories: [] })),
        http.get(`${API_URL}/accounts/acc-1/holdings`, () =>
          HttpResponse.json({ accountId: "acc-1", holdings: [], valuation: {} })
        )
      );
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("tab", { name: "Transactions" }));
      await screen.findByText("No transactions for this account yet.");
    }

    it.each(["investment", "crypto"] as const)("shows the formatted net for a %s account", async (type) => {
      await openTransactions(makeAccount({ type, contributions }));
      expect(screen.getByText(/Net contributions:/).closest("p")).toHaveTextContent("Net contributions: $1,200.00");
      expect(screen.getByText("Transfers in $1,500.00 · out $300.00")).toBeInTheDocument();
      expect(screen.queryByText(/without a recorded amount/)).not.toBeInTheDocument();
    });

    it("notes transfers without a recorded amount", async () => {
      await openTransactions(
        makeAccount({ type: "investment", contributions: { ...contributions, excludedCount: 2 } })
      );
      expect(screen.getByText("2 transfers without a recorded amount are not included")).toBeInTheDocument();
    });

    it("is hidden for a checking account", async () => {
      await openTransactions(makeAccount({ contributions: null }));
      expect(screen.queryByText(/Net contributions/)).not.toBeInTheDocument();
    });
  });

  describe("new account (/accounts/new)", () => {
    function renderNew() {
      return renderWithProviders(
        <Routes>
          <Route path="/accounts/new" element={<AccountDetailPage />} />
          <Route path="/accounts/:id" element={<AccountDetailPage />} />
          <Route path="/accounts" element={<p>Accounts list</p>} />
        </Routes>,
        { route: "/accounts/new", withAuth: true }
      );
    }

    it("renders an empty General form with no tabs beyond General, sync panel or actions", async () => {
      mockAccounts([]);
      renderNew();

      expect(
        await screen.findByRole("heading", { name: "New account" })
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Name")).toHaveValue("");
      expect(screen.getByLabelText("Type")).toHaveValue("checking");
      expect(screen.getByLabelText("Initial balance")).toHaveValue(0);
      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
        "General"
      ]);
      expect(
        screen.queryByRole("button", { name: "Record actions" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /resync/i })
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(screen.queryByLabelText("Credit limit")).not.toBeInTheDocument();
    });

    it("shows the credit-card section when the type is Credit", async () => {
      mockAccounts([]);
      const user = userEvent.setup();
      renderNew();

      await user.selectOptions(
        await screen.findByLabelText("Type"),
        "credit_card"
      );

      expect(screen.getByLabelText("Credit limit")).toBeInTheDocument();
      expect(
        screen.getByLabelText("Statement closing day")
      ).toBeInTheDocument();
    });

    it("rejects an out-of-range closing day and keeps Save disabled", async () => {
      mockAccounts([]);
      const user = userEvent.setup();
      renderNew();

      await user.type(await screen.findByLabelText("Name"), "Visa");
      await user.selectOptions(screen.getByLabelText("Type"), "credit_card");
      await user.type(screen.getByLabelText("Statement closing day"), "40");

      expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("rejects a negative credit limit and keeps Save disabled", async () => {
      mockAccounts([]);
      const user = userEvent.setup();
      renderNew();

      await user.type(await screen.findByLabelText("Name"), "Visa");
      await user.selectOptions(screen.getByLabelText("Type"), "credit_card");
      await user.type(screen.getByLabelText("Credit limit"), "-5");

      expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("creates the account on Save and opens its detail page", async () => {
      mockAccounts([]);
      const created = makeAccount({ id: "acc-new", name: "Wallet" });
      let body: unknown;
      server.use(
        http.post(`${API_URL}/accounts`, async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ account: created }, { status: 201 });
        })
      );
      const user = userEvent.setup();
      renderNew();

      await user.type(await screen.findByLabelText("Name"), "Wallet");
      server.use(
        http.get(`${API_URL}/accounts`, () =>
          HttpResponse.json({ accounts: [created] })
        )
      );
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(body).toMatchObject({
          name: "Wallet",
          type: "checking",
          currency: "USD"
        })
      );
      expect(
        await screen.findByRole("heading", { name: "Wallet" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: "Transactions" })
      ).toBeInTheDocument();
    });

    it("creates nothing when going back without saving", async () => {
      mockAccounts([]);
      let posted = false;
      server.use(
        http.post(`${API_URL}/accounts`, () => {
          posted = true;
          return HttpResponse.json({ account: makeAccount() }, { status: 201 });
        })
      );
      const user = userEvent.setup();
      renderNew();

      await user.type(await screen.findByLabelText("Name"), "Wallet");
      await user.click(screen.getByRole("link", { name: /Back to accounts/ }));
      await user.click(screen.getByRole("button", { name: "Discard changes" }));

      expect(await screen.findByText("Accounts list")).toBeInTheDocument();
      expect(posted).toBe(false);
    });
  });
});
