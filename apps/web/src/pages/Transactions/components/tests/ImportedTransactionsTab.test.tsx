import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Account } from "../../../../types/accounts.types";
import type { Category } from "../../../../types/categories.types";
import type { ProviderImportedTransaction } from "../../../../types/transactions.types";
import { useImportedTransactionsWorkflow } from "../../hooks/useImportedTransactionsWorkflow";
import { ImportedTransactionsTab } from "../ImportedTransactionsTab";

const API_URL = "http://localhost:4000";

function makeRow(id: string, status: ProviderImportedTransaction["status"] = "pending") {
  return {
    id,
    provider: "syncfy",
    providerAccountId: "pa-1",
    providerTransactionId: `raw-${id}`,
    description: `Row ${id}`,
    amount: "-5",
    currency: "USD",
    transactionDate: "2024-01-15T00:00:00.000Z",
    status,
    categoryId: null,
    createdAt: "",
    updatedAt: ""
  } as ProviderImportedTransaction;
}

function mockList(rows: ProviderImportedTransaction[], total = rows.length) {
  server.use(
    http.get(`${API_URL}/transactions/imported`, () =>
      HttpResponse.json({ importedTransactions: rows, total, pendingCount: 0 })
    )
  );
}

const NO_CATEGORIES: Category[] = [];
const NO_ACCOUNTS: Account[] = [];
const NO_PARAMS = new URLSearchParams();

function Harness() {
  const imported = useImportedTransactionsWorkflow({ searchParams: NO_PARAMS });
  return (
    <ImportedTransactionsTab
      imported={imported}
      categories={NO_CATEGORIES}
      accounts={NO_ACCOUNTS}
      initialStatus={null}
      searchBarResetKey={0}
      onShowPending={() => {}}
    />
  );
}

describe("ImportedTransactionsTab", () => {
  it("selects only the visible window and labels checkboxes by description", async () => {
    mockList([makeRow("a"), makeRow("b")], 2);
    renderWithProviders(<Harness />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("checkbox", { name: "Select imported transaction Row a" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Select page" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("sends a filtered selection when selecting all matching", async () => {
    mockList([makeRow("a"), makeRow("b")], 120);
    let body: unknown;
    server.use(
      http.post(`${API_URL}/transactions/imported/batch-ignore`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ignoredCount: 120, errors: [] });
      })
    );
    renderWithProviders(<Harness />);
    const user = userEvent.setup();

    await screen.findByText("Row a");
    await user.click(screen.getByRole("button", { name: "Select page" }));
    await user.click(screen.getByRole("button", { name: "Select all 120 matching" }));
    await user.click(screen.getByRole("button", { name: /^Ignore all filtered results/ }));

    await waitFor(() => expect(body).toEqual({ selection: { mode: "filtered" } }));
  });

  it("sends explicit ids for a windowed selection", async () => {
    mockList([makeRow("a"), makeRow("b")], 2);
    let body: unknown;
    server.use(
      http.post(`${API_URL}/transactions/imported/batch-ignore`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ignoredCount: 1, errors: [] });
      })
    );
    renderWithProviders(<Harness />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("checkbox", { name: "Select imported transaction Row b" }));
    await user.click(screen.getByRole("button", { name: /^Ignore visible selection/ }));

    await waitFor(() => expect(body).toEqual({ selection: { mode: "ids", ids: ["b"] } }));
  });

  it("offers Unignore only when every visible row is ignored, and no Import/Ignore then", async () => {
    mockList([makeRow("a", "ignored")], 1);
    renderWithProviders(<Harness />);

    await screen.findByText("Row a");
    expect(screen.getByRole("button", { name: /^Unignore visible selection/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Import visible selection/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Ignore visible selection/ })).not.toBeInTheDocument();
  });

  it("shows no batch Import/Ignore for a mixed-status window", async () => {
    mockList([makeRow("a"), makeRow("b", "ignored")], 2);
    renderWithProviders(<Harness />);

    await screen.findByText("Row a");
    expect(screen.queryByRole("button", { name: /^Unignore visible selection/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Import visible selection/ })).not.toBeInTheDocument();
  });
});
