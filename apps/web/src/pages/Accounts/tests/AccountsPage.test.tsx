import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { server } from "../../../tests/mocks/server";
import type { Account } from "../../../types/accounts.types";
import { AccountsPage } from "../AccountsPage";

vi.mock("../utils/syncfyWidget", () => ({ openSyncfyWidget: vi.fn() }));

const API_URL = "http://localhost:4000";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc-1",
    name: "Checking",
    type: "checking",
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

function mockBaseline(accounts: Account[] = []) {
  server.use(
    http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    http.get(`${API_URL}/accounts`, () => HttpResponse.json({ accounts })),
    http.get(`${API_URL}/providers/connectors`, () => HttpResponse.json({ connectors: [] })),
    http.get(`${API_URL}/providers/accounts`, () => HttpResponse.json({ accounts: [] }))
  );
}

describe("AccountsPage", () => {
  it("renders accounts and keeps the add-account form closed by default", async () => {
    mockBaseline([makeAccount()]);
    renderWithProviders(<AccountsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Checking")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Add account" })).not.toBeInTheDocument();
  });

  it("shows 'No accounts found.' when the list is empty", async () => {
    mockBaseline([]);
    renderWithProviders(<AccountsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("No accounts found.")).toBeInTheDocument());
  });

  it("opens the add-account form via the AddRecordButton", async () => {
    mockBaseline([]);
    const user = userEvent.setup();
    renderWithProviders(<AccountsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("No accounts found.")).toBeInTheDocument());
    await user.click(screen.getAllByRole("button", { name: "Add account" })[0]!);

    expect(screen.getByRole("heading", { name: "Add account" })).toBeInTheDocument();
  });

  it("groups accounts by type when 'Group by Type' is active", async () => {
    mockBaseline([
      makeAccount({ id: "acc-1", name: "Checking", type: "checking" }),
      makeAccount({ id: "acc-2", name: "Savings", type: "savings" })
    ]);
    const user = userEvent.setup();
    renderWithProviders(<AccountsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Checking")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Filter, group, and sort" }));
    await user.click(screen.getByLabelText("Type"));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 3, name: "checking" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 3, name: "savings" })).toBeInTheDocument();
    });
  });

  it("groups accounts by source (Manual/Synced) when active", async () => {
    mockBaseline([
      makeAccount({ id: "acc-1", name: "Checking", source: "manual" }),
      makeAccount({ id: "acc-2", name: "Linked account", source: "synced" })
    ]);
    const user = userEvent.setup();
    renderWithProviders(<AccountsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Checking")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Filter, group, and sort" }));
    await user.click(screen.getByLabelText("Source"));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 3, name: "Manual" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 3, name: "Synced" })).toBeInTheDocument();
    });
  });

  it("expands an account's mobile details via its toggle button", async () => {
    mockBaseline([makeAccount({ identifier: "****1234" })]);
    const user = userEvent.setup();
    renderWithProviders(<AccountsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Checking")).toBeInTheDocument());
    const toggle = screen.getByRole("button", { name: "Show details for Checking" });

    await user.click(toggle);

    expect(screen.getByRole("button", { name: "Hide details for Checking" })).toBeInTheDocument();
  });
});
