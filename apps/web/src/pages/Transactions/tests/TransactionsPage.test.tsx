import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { server } from "../../../tests/mocks/server";
import type { ProviderImportedTransaction } from "../../../types/transactions.types";
import type { Transaction } from "../../../types/transactions.types";
import { TransactionsPage } from "../TransactionsPage";

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

const API_URL = "http://localhost:4000";

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    name: "Groceries",
    amount: "42.5",
    executionCurrency: "USD",
    exchangeRate: 1,
    amountInPreferredCurrency: 42.5,
    type: "expense",
    date: "2024-01-15T00:00:00.000Z",
    accountId: "acc-1",
    categoryId: "cat-1",
    account: { id: "acc-1", name: "Checking" } as Transaction["account"],
    category: { id: "cat-1", name: "Groceries" } as Transaction["category"],
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function makeImportedTransaction(
  overrides: Partial<ProviderImportedTransaction> = {}
): ProviderImportedTransaction {
  return {
    id: "pt-1",
    provider: "syncfy",
    providerAccountId: "pa-1",
    providerTransactionId: "raw-1",
    description: "Coffee shop",
    amount: "-5.5",
    currency: "USD",
    transactionDate: "2024-01-15T00:00:00.000Z",
    status: "pending",
    categoryId: null,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function mockBaseline({
  transactions = [makeTransaction()],
  importedTransactions = [] as ProviderImportedTransaction[],
  pendingCount = 0
} = {}) {
  server.use(
    http.post(
      `${API_URL}/auth/refresh`,
      () => new HttpResponse(null, { status: 401 })
    ),
    http.get(`${API_URL}/transactions`, () =>
      HttpResponse.json({ data: transactions, meta: {} })
    ),
    http.get(`${API_URL}/transactions/imported`, () =>
      HttpResponse.json({
        importedTransactions,
        total: importedTransactions.length,
        pendingCount
      })
    ),
    http.get(`${API_URL}/accounts`, () =>
      HttpResponse.json({
        accounts: [
          {
            id: "acc-1",
            name: "Checking",
            type: "checking",
            currency: "USD",
            initialBalance: 0,
            isArchived: false,
            createdAt: "",
            updatedAt: ""
          }
        ]
      })
    ),
    http.get(`${API_URL}/categories`, () =>
      HttpResponse.json({
        categories: [
          {
            id: "cat-1",
            name: "Groceries",
            type: "expense",
            isArchived: false,
            createdAt: "",
            updatedAt: ""
          }
        ]
      })
    ),
    http.get(`${API_URL}/groups`, () => HttpResponse.json({ groups: [] })),
    http.get(`${API_URL}/currencies`, () =>
      HttpResponse.json({
        currencies: [{ code: "USD", name: "US Dollar" }],
        fiat: [{ code: "USD", name: "US Dollar" }],
        crypto: []
      })
    )
  );
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("TransactionsPage", () => {
  it("defaults to the Transactions tab, listing transactions", async () => {
    mockBaseline();
    renderWithProviders(<TransactionsPage />, { withAuth: true });

    await waitFor(() =>
      expect(screen.getByText("Groceries")).toBeInTheDocument()
    );
    expect(
      screen.queryByRole("heading", { name: "New transaction" })
    ).not.toBeInTheDocument();
  });

  it("opens the new-transaction route via the AddRecordButton", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <TransactionsPage />
        <LocationProbe />
      </>,
      { withAuth: true, route: "/transactions" }
    );

    await waitFor(() =>
      expect(screen.getByText("Groceries")).toBeInTheDocument()
    );
    await user.click(
      screen.getAllByRole("button", { name: "Add transaction" })[0]!
    );

    expect(screen.getByTestId("location")).toHaveTextContent(
      /^\/transactions\/new$/
    );
  });

  it("switches to the Imported Transactions tab, showing a pending-count badge", async () => {
    mockBaseline({
      importedTransactions: [makeImportedTransaction()],
      pendingCount: 1
    });
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />, { withAuth: true });

    await waitFor(() =>
      expect(screen.getByText("Groceries")).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole("button", { name: "Imported Transactions (1 pending)" })
    );

    expect(screen.getByText("Coffee shop")).toBeInTheDocument();
  });

  it("shows the pending-review banner on the imported tab and 'Show pending' re-filters to pending", async () => {
    mockBaseline({
      importedTransactions: [makeImportedTransaction()],
      pendingCount: 1
    });
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />, { withAuth: true });

    // The banner only renders within the Imported Transactions tab, not
    // alongside the personal-transactions list.
    await waitFor(() =>
      expect(screen.getByText("Groceries")).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole("button", { name: "Imported Transactions (1 pending)" })
    );

    await waitFor(() =>
      expect(
        screen.getByText("You have 1 imported transaction pending review.")
      ).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Show pending" }));

    await waitFor(() =>
      expect(screen.getByText("Coffee shop")).toBeInTheDocument()
    );
    expect(screen.getByText("Status is pending")).toBeInTheDocument();
  });

  it("deletes a transaction after confirmation", async () => {
    mockBaseline();
    let deleted = false;
    server.use(
      http.delete(`${API_URL}/transactions/tx-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />, { withAuth: true });

    await waitFor(() =>
      expect(screen.getByText("Groceries")).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole("button", { name: "Actions for Groceries" })
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    await waitFor(() => expect(deleted).toBe(true));
  });

  it("does not delete when the confirmation is dismissed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mockBaseline();
    let deleted = false;
    server.use(
      http.delete(`${API_URL}/transactions/tx-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />, { withAuth: true });

    await waitFor(() =>
      expect(screen.getByText("Groceries")).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole("button", { name: "Actions for Groceries" })
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(deleted).toBe(false);
  });

  it("groups transactions by category when 'Group by Category' is active", async () => {
    mockBaseline({
      transactions: [
        makeTransaction({ id: "tx-1", name: "Groceries", categoryId: "cat-1" }),
        makeTransaction({
          id: "tx-2",
          name: "Salary",
          categoryId: null,
          category: null,
          type: "income"
        })
      ]
    });
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />, { withAuth: true });

    await waitFor(() =>
      expect(screen.getByText("Groceries")).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole("button", { name: "Filter, group, and sort" })
    );
    await user.click(screen.getByLabelText("Category"));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 3, name: "Groceries" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 3, name: "Uncategorized" })
      ).toBeInTheDocument();
    });
  });

  it("groups a transaction under its local month at UTC-6", async () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "America/Mexico_City";
    try {
      mockBaseline({
        transactions: [
          makeTransaction({
            id: "tx-1",
            name: "Boundary",
            date: "2026-06-01T03:00:00.000Z"
          })
        ]
      });
      const user = userEvent.setup();
      renderWithProviders(<TransactionsPage />, { withAuth: true });

      await waitFor(() =>
        expect(screen.getByText("Boundary")).toBeInTheDocument()
      );
      await user.click(
        screen.getByRole("button", { name: "Filter, group, and sort" })
      );
      await user.click(screen.getByLabelText("Month"));

      await waitFor(() =>
        expect(
          screen.getByRole("heading", { level: 3, name: "2026-05" })
        ).toBeInTheDocument()
      );
      expect(
        screen.queryByRole("heading", { level: 3, name: "2026-06" })
      ).not.toBeInTheDocument();
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it("imports a single imported transaction end-to-end", async () => {
    mockBaseline({
      importedTransactions: [makeImportedTransaction({ categoryId: "cat-1" })],
      pendingCount: 1
    });
    let imported = false;
    server.use(
      http.post(`${API_URL}/transactions/imported/pt-1/import`, () => {
        imported = true;
        return HttpResponse.json({
          importedTransaction: makeImportedTransaction()
        });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />, { withAuth: true });

    await waitFor(() =>
      expect(screen.getByText("Groceries")).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole("button", { name: "Imported Transactions (1 pending)" })
    );
    await waitFor(() =>
      expect(screen.getByText("Coffee shop")).toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(imported).toBe(true));
  });

  it("navigates to the transaction view from a transaction's Edit action", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <TransactionsPage />
        <LocationProbe />
      </>,
      { withAuth: true, route: "/transactions" }
    );

    await waitFor(() =>
      expect(screen.getByText("Groceries")).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole("button", { name: "Actions for Groceries" })
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(screen.getByTestId("location")).toHaveTextContent(
      /^\/transactions\/tx-1$/
    );
  });
});

describe("TransactionsPage pagination", () => {
  type PagedQuery = {
    where?: unknown;
    sort?: unknown;
    pagination: { kind: string; offset: number; limit: number };
  };

  function mockPaged() {
    mockBaseline();
    const queries: PagedQuery[] = [];
    server.use(
      http.get(`${API_URL}/transactions`, ({ request }) => {
        const query = JSON.parse(
          new URL(request.url).searchParams.get("query")!
        ) as PagedQuery;
        queries.push(query);
        const { offset, limit } = query.pagination;
        return HttpResponse.json({
          data: [
            makeTransaction({ id: `tx-${offset}`, name: `Row at ${offset}` })
          ],
          meta: {
            total: 120,
            page: null,
            pageSize: null,
            pageCount: null,
            hasNext: offset + limit < 120,
            hasPrevious: offset > 0,
            executionTime: 1
          }
        });
      })
    );
    return queries;
  }

  it("requests the first 50-row range and shows the server total", async () => {
    const queries = mockPaged();
    renderWithProviders(<TransactionsPage />, { withAuth: true });

    expect(await screen.findByText("Row at 0")).toBeInTheDocument();
    expect(screen.getByText("1-50 / 120")).toBeInTheDocument();
    expect(queries.at(-1)!.pagination).toEqual({
      kind: "range",
      offset: 0,
      limit: 50
    });
    expect(queries.at(-1)!.sort).toEqual([
      { field: "date", direction: "desc" }
    ]);
  });

  it("pages forward, resets to offset 0 on a search change and keeps a typed window size", async () => {
    const queries = mockPaged();
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />, { withAuth: true });
    await screen.findByText("Row at 0");

    await user.click(screen.getByRole("button", { name: "Next records" }));
    expect(await screen.findByText("Row at 50")).toBeInTheDocument();
    expect(queries.at(-1)?.pagination.offset).toBe(50);

    await user.click(screen.getByRole("button", { name: /edit range/ }));
    await user.clear(screen.getByLabelText("Record range"));
    await user.type(screen.getByLabelText("Record range"), "1-100{Enter}");
    await waitFor(() =>
      expect(queries.at(-1)?.pagination).toEqual({
        kind: "range",
        offset: 0,
        limit: 100
      })
    );

    await user.click(screen.getByRole("button", { name: "Next records" }));
    await waitFor(() => expect(queries.at(-1)?.pagination.offset).toBe(100));
    await user.type(
      screen.getByPlaceholderText("Search transactions"),
      "rent{Enter}"
    );
    await waitFor(() =>
      expect(queries.at(-1)?.pagination).toEqual({
        kind: "range",
        offset: 0,
        limit: 100
      })
    );
    expect(queries.at(-1)?.where).toMatchObject({
      field: "name",
      value: "rent"
    });
  });

  it("shows the empty state for an empty transactions list", async () => {
    mockBaseline({ transactions: [] });
    renderWithProviders(<TransactionsPage />, { withAuth: true });
    expect(
      await screen.findByText("No transactions found.")
    ).toBeInTheDocument();
  });

  it("shows an error when the transactions request fails", async () => {
    mockBaseline();
    server.use(
      http.get(`${API_URL}/transactions`, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 })
      )
    );
    renderWithProviders(<TransactionsPage />, { withAuth: true });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

describe("TransactionsPage imported tab", () => {
  type ImportedQuery = {
    where?: unknown;
    pagination: { kind: string; offset: number; limit: number };
  };

  function mockImported(
    rows: ProviderImportedTransaction[],
    total = rows.length
  ) {
    mockBaseline();
    const queries: ImportedQuery[] = [];
    const batches: {
      path: string;
      body: { selection: unknown; categoryId?: string };
    }[] = [];
    server.use(
      http.get(`${API_URL}/transactions/imported`, ({ request }) => {
        queries.push(
          JSON.parse(new URL(request.url).searchParams.get("query")!)
        );
        return HttpResponse.json({
          importedTransactions: rows,
          total,
          pendingCount: total
        });
      }),
      http.post(
        `${API_URL}/transactions/imported/:action`,
        async ({ request, params }) => {
          batches.push({
            path: String(params.action),
            body: (await request.json()) as never
          });
          return HttpResponse.json({
            importedCount: 1,
            ignoredCount: 1,
            unignoredCount: 1,
            errors: []
          });
        }
      )
    );
    return { queries, batches };
  }

  it("requests a 50-row range and shows the range pager with the server total", async () => {
    const { queries } = mockImported([makeImportedTransaction()], 120);
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />, {
      withAuth: true,
      route: "/?tab=imported"
    });

    expect(await screen.findByText("1-50 / 120")).toBeInTheDocument();
    expect(queries[0]!.pagination).toEqual({
      kind: "range",
      offset: 0,
      limit: 50
    });

    await user.click(screen.getByRole("button", { name: "Next records" }));
    await waitFor(() => expect(queries.at(-1)?.pagination.offset).toBe(50));
  });

  it("shows the empty state, and the loading state while the request is pending", async () => {
    mockImported([]);
    renderWithProviders(<TransactionsPage />, {
      withAuth: true,
      route: "/?tab=imported"
    });
    expect(screen.getAllByText("Loading...").length).toBeGreaterThan(0);
    expect(
      await screen.findByText("No imported transactions found.")
    ).toBeInTheDocument();
  });

  it("batch-imports the selected rows by id, then clears the selection", async () => {
    const { batches } = mockImported([
      makeImportedTransaction({ categoryId: "cat-1" })
    ]);
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />, {
      withAuth: true,
      route: "/?tab=imported&status=pending"
    });
    await screen.findByText("Coffee shop");

    await user.click(screen.getByRole("checkbox", { name: "Select imported transaction Coffee shop" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Import visible selection" })
    );

    await waitFor(() => expect(batches[0]?.path).toBe("batch-import"));
    expect(batches[0]!.body.selection).toEqual({ mode: "ids", ids: ["pt-1"] });
    await waitFor(() =>
      expect(screen.getByText("0 selected")).toBeInTheDocument()
    );
  });

  it("sends a filtered-mode selection after 'Select all N matching'", async () => {
    const { batches } = mockImported([makeImportedTransaction()], 120);
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />, {
      withAuth: true,
      route: "/?tab=imported&status=pending"
    });
    await screen.findByText("Coffee shop");

    await user.click(screen.getByRole("button", { name: "Select page" }));
    await user.click(
      screen.getByRole("button", { name: "Select all 120 matching" })
    );
    await user.click(
      screen.getByRole("button", { name: "Ignore all filtered results" })
    );

    await waitFor(() => expect(batches[0]?.path).toBe("batch-ignore"));
    expect(batches[0]!.body.selection).toMatchObject({
      mode: "filtered",
      where: { field: "status", op: "=", value: "pending" }
    });
  });

  it("gates batch actions on the visible rows' status", async () => {
    mockImported([makeImportedTransaction({ status: "ignored" })]);
    renderWithProviders(<TransactionsPage />, {
      withAuth: true,
      route: "/?tab=imported"
    });
    await screen.findByText("Coffee shop");

    expect(
      screen.getByRole("button", { name: /Unignore visible selection/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Import visible/ })
    ).not.toBeInTheDocument();
  });

  it("shows the batch error and per-row failures", async () => {
    mockImported([makeImportedTransaction({ categoryId: "cat-1" })]);
    server.use(
      http.post(`${API_URL}/transactions/imported/batch-import`, () =>
        HttpResponse.json(
          {
            message: "Batch import failed",
            errors: [{ id: "pt-1", message: "Missing category" }]
          },
          { status: 400 }
        )
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />, {
      withAuth: true,
      route: "/?tab=imported&status=pending"
    });
    await screen.findByText("Coffee shop");

    await user.click(screen.getByRole("checkbox", { name: "Select imported transaction Coffee shop" }));
    await user.click(
      screen.getByRole("button", { name: "Import visible selection" })
    );

    expect(
      await screen.findByText("pt-1: Missing category")
    ).toBeInTheDocument();
  });
});
