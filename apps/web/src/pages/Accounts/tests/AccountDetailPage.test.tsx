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
    initialBalance: 500,
    currentBalance: 500,
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
});
