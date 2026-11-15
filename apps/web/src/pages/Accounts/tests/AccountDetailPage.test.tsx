import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
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
          { provider: "syncfy", connectorId: "c1", title: "Bank", description: "d", country: "US", category: "bank", coverageLabel: "Popular" }
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
          meta: { total: 0, page: 1, pageSize: 20, pageCount: 0, hasNext: false, hasPrevious: false, executionTime: 1 }
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
    expect(await screen.findByText("No transactions for this account yet.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("narrows Transactions to a billing period, including transfers into the account, and can clear it", async () => {
    mockAccounts([makeAccount({ type: "credit_card" })]);
    const wheres: unknown[] = [];
    server.use(
      http.get(`${API_URL}/transactions`, ({ request }) => {
        wheres.push(JSON.parse(new URL(request.url).searchParams.get("query")!).where);
        return HttpResponse.json({ data: [], meta: { total: 0, hasNext: false } });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/accounts/:id" element={<AccountDetailPage />} />
      </Routes>,
      {
        route: "/accounts/acc-1?tab=transactions&periodFrom=2027-01-21&periodTo=2027-02-20&periodStartAt=2027-01-21T06:00:00.000Z&periodEndAt=2027-02-21T06:00:00.000Z",
        withAuth: true
      }
    );

    expect(await screen.findByText(/Billing period/)).toBeInTheDocument();
    await waitFor(() => expect(JSON.stringify(wheres[0])).toContain("transferToAccountId"));
    expect(JSON.stringify(wheres[0])).toContain("2027-01-21T06:00:00.000Z");
    expect(JSON.stringify(wheres[0])).toContain("2027-02-21T06:00:00.000Z");
    await user.click(screen.getByRole("button", { name: "Clear period" }));
    await waitFor(() => expect(screen.queryByText(/Billing period/)).not.toBeInTheDocument());
    await waitFor(() => expect(JSON.stringify(wheres.at(-1))).not.toContain("transferToAccountId"));
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
    expect(screen.getByRole("tab", { name: "Credit card" })).toBeInTheDocument();
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

      expect(await screen.findByRole("heading", { name: "New account" })).toBeInTheDocument();
      expect(screen.getByLabelText("Name")).toHaveValue("");
      expect(screen.getByLabelText("Type")).toHaveValue("checking");
      expect(screen.getByLabelText("Initial balance")).toHaveValue(0);
      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["General"]);
      expect(screen.queryByRole("button", { name: "Record actions" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /resync/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(screen.queryByLabelText("Credit limit")).not.toBeInTheDocument();
    });

    it("shows the credit-card section when the type is Credit card", async () => {
      mockAccounts([]);
      const user = userEvent.setup();
      renderNew();

      await user.selectOptions(await screen.findByLabelText("Type"), "credit_card");

      expect(screen.getByLabelText("Credit limit")).toBeInTheDocument();
      expect(screen.getByLabelText("Statement closing day")).toBeInTheDocument();
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
        http.get(`${API_URL}/accounts`, () => HttpResponse.json({ accounts: [created] }))
      );
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(body).toMatchObject({ name: "Wallet", type: "checking", currency: "USD" })
      );
      expect(await screen.findByRole("heading", { name: "Wallet" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Transactions" })).toBeInTheDocument();
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
