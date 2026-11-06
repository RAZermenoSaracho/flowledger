import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../tests/mocks/server";
import type { Transaction } from "../../../types/transactions.types";
import { TransactionEditPage } from "../TransactionEditPage";

const API_URL = "http://localhost:4000";

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    name: "Groceries",
    amount: 42.5,
    executionCurrency: "USD",
    exchangeRate: 1,
    amountInPreferredCurrency: 42.5,
    type: "expense",
    date: "2026-05-31T21:33:15.979Z",
    accountId: "acc-1",
    categoryId: "cat-1",
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function mockBaseline(transaction: Transaction = makeTransaction()) {
  server.use(
    http.get(`${API_URL}/transactions/tx-1`, () => HttpResponse.json({ transaction })),
    http.get(`${API_URL}/accounts`, () =>
      HttpResponse.json({
        accounts: [
          { id: "acc-1", name: "Checking", type: "checking", currency: "USD", initialBalance: 0, isArchived: false, createdAt: "", updatedAt: "" },
          { id: "acc-2", name: "Savings", type: "savings", currency: "USD", initialBalance: 0, isArchived: false, createdAt: "", updatedAt: "" }
        ]
      })
    ),
    http.get(`${API_URL}/categories`, () =>
      HttpResponse.json({
        categories: [
          { id: "cat-1", name: "Groceries", type: "expense", isArchived: false, createdAt: "", updatedAt: "" }
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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/transactions/tx-1/edit"]}>
        <Routes>
          <Route path="/transactions" element={<div>Transactions list</div>} />
          <Route path="/transactions/:id/edit" element={<TransactionEditPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("TransactionEditPage", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "America/Mexico_City";
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it("shows a loading message before the transaction loads", () => {
    mockBaseline();
    renderPage();
    expect(screen.getByText("Loading transaction...")).toBeInTheDocument();
  });

  it("pre-fills the form from the loaded transaction", async () => {
    mockBaseline();
    renderPage();

    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Groceries"));
    expect(screen.getByLabelText("Amount")).toHaveValue(42.5);
    expect(screen.getByLabelText("Date and time")).toHaveValue("2026-05-31T15:33");
  });

  it("Reset to now sets the field to the current local date and time", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-11-06T03:07:00.000Z"));
    mockBaseline();
    const user = userEvent.setup({ delay: null });
    renderPage();

    await waitFor(() =>
      expect(screen.getByLabelText("Date and time")).toHaveValue("2026-05-31T15:33")
    );
    await user.click(screen.getByRole("button", { name: "Reset to now" }));

    expect(screen.getByLabelText("Date and time")).toHaveValue("2026-11-05T21:07");
  });

  describe("date in the update request", () => {
    async function saveWithDateInput(
      change: ((dateInput: HTMLElement) => void) | null,
      transaction: Transaction = makeTransaction()
    ) {
      mockBaseline(transaction);
      let body: Record<string, unknown> = {};
      server.use(
        http.put(`${API_URL}/transactions/tx-1`, async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ transaction });
        })
      );
      const user = userEvent.setup();
      renderPage();
      const dateInput = await screen.findByLabelText("Date and time");
      await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Groceries"));
      change?.(dateInput);
      await user.type(screen.getByLabelText("Notes"), "n");
      await user.click(screen.getByRole("button", { name: "Save transaction" }));
      await waitFor(() => expect(screen.getByText("Transactions list")).toBeInTheDocument());
      return body;
    }

    const setDate = (value: string) => (input: HTMLElement) =>
      fireEvent.change(input, { target: { value } });

    it("omits date when the field is unchanged", async () => {
      const body = await saveWithDateInput(null);
      expect(body).not.toHaveProperty("date");
    });

    it("omits date when the field is changed and restored", async () => {
      const body = await saveWithDateInput((input) => {
        fireEvent.change(input, { target: { value: "2026-06-02T15:33" } });
        fireEvent.change(input, { target: { value: "2026-05-31T15:33" } });
      });
      expect(body).not.toHaveProperty("date");
    });

    it("keeps the local time and sub-minute precision when only the date changes", async () => {
      const body = await saveWithDateInput(setDate("2026-06-02T15:33"));
      expect(body.date).toBe("2026-06-02T21:33:15.979Z");
    });

    it("keeps the local date and sub-minute precision when only the time changes", async () => {
      const body = await saveWithDateInput(setDate("2026-05-31T16:45"));
      expect(body.date).toBe("2026-05-31T22:45:15.979Z");
    });

    it("keeps the local time of day across a DST change", async () => {
      process.env.TZ = "America/Los_Angeles";
      const body = await saveWithDateInput(
        setDate("2026-03-09T09:00"),
        makeTransaction({ date: "2026-03-07T17:00:00.000Z" })
      );
      expect(body.date).toBe("2026-03-09T16:00:00.000Z");
    });
  });

  it("submits the updated form and navigates back to the transactions list", async () => {
    mockBaseline();
    let updatedBody: unknown;
    server.use(
      http.put(`${API_URL}/transactions/tx-1`, async ({ request }) => {
        updatedBody = await request.json();
        return HttpResponse.json({ transaction: makeTransaction({ name: "New name" }) });
      })
    );
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Groceries"));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "New name");
    await user.click(screen.getByRole("button", { name: "Save transaction" }));

    await waitFor(() => expect(screen.getByText("Transactions list")).toBeInTheDocument());
    expect(updatedBody).toMatchObject({ name: "New name" });
  });

  it("Cancel navigates back to the transactions list without saving", async () => {
    mockBaseline();
    let called = false;
    server.use(
      http.put(`${API_URL}/transactions/tx-1`, () => {
        called = true;
        return HttpResponse.json({ transaction: makeTransaction() });
      })
    );
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Groceries"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Transactions list")).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it("switching to transfer shows From/To fields and hides category/group", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Groceries"));
    await user.selectOptions(screen.getByLabelText("Type"), "transfer");

    expect(screen.getByLabelText("From account")).toBeInTheDocument();
    expect(screen.getByLabelText("To account")).toBeInTheDocument();
    expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();
  });

  it("disables submit for a transfer missing a To account", async () => {
    mockBaseline(
      makeTransaction({
        type: "transfer",
        categoryId: null,
        accountId: "acc-1",
        transferToAccountId: null
      })
    );
    renderPage();

    // The From/To dropdowns are mutually exclusive by construction (each
    // excludes whatever the other already selected), so "the same account
    // in both" can't be reached through the UI — this exercises the
    // reachable case: To account left unselected.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save transaction" })).toBeDisabled()
    );
  });

  it("only shows categories matching the selected transaction type", async () => {
    mockBaseline();
    server.use(
      http.get(`${API_URL}/categories`, () =>
        HttpResponse.json({
          categories: [
            { id: "cat-1", name: "Groceries", type: "expense", isArchived: false, createdAt: "", updatedAt: "" },
            { id: "cat-2", name: "Salary", type: "income", isArchived: false, createdAt: "", updatedAt: "" }
          ]
        })
      )
    );
    renderPage();

    await waitFor(() => expect(screen.getByLabelText("Category")).toHaveValue("cat-1"));

    expect(screen.getByRole("option", { name: "Groceries" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Salary" })).not.toBeInTheDocument();
  });

  it("switching type clears a categoryId that no longer matches the new type", async () => {
    mockBaseline();
    server.use(
      http.get(`${API_URL}/categories`, () =>
        HttpResponse.json({
          categories: [
            { id: "cat-1", name: "Groceries", type: "expense", isArchived: false, createdAt: "", updatedAt: "" },
            { id: "cat-2", name: "Salary", type: "income", isArchived: false, createdAt: "", updatedAt: "" }
          ]
        })
      )
    );
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByLabelText("Category")).toHaveValue("cat-1"));
    await user.selectOptions(screen.getByLabelText("Type"), "income");

    expect(screen.getByLabelText("Category")).toHaveValue("");
  });

  it("selecting a group clears the category selection", async () => {
    mockBaseline();
    server.use(
      http.get(`${API_URL}/groups`, () =>
        HttpResponse.json({
          groups: [
            {
              id: "group-1",
              name: "Roommates",
              ownerUserId: "user-1",
              isArchived: false,
              members: [],
              categories: [],
              createdAt: "",
              updatedAt: ""
            }
          ]
        })
      )
    );
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByLabelText("Category")).toHaveValue("cat-1"));
    await user.selectOptions(screen.getByLabelText("Group"), "group-1");

    expect(screen.getByLabelText("Category")).toHaveValue("");
  });
});
