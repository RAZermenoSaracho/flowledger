import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../../hooks/useAuth";
import { server } from "../../../tests/mocks/server";
import type { Group } from "../../../types/groups.types";
import type { Transaction } from "../../../types/transactions.types";
import { TransactionEditRedirect } from "../components/TransactionEditRedirect";
import { TransactionDetailPage } from "../TransactionDetailPage";

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
    account: { id: "acc-1", name: "Checking" } as Transaction["account"],
    category: { id: "cat-1", name: "Groceries" } as Transaction["category"],
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function makeGroup(overrides: Partial<Group> = {}): Group {
  const member = (id: string, name: string, role: "admin" | "member") => ({
    id: `m-${id}`,
    groupId: "group-1",
    userId: id,
    role,
    user: { id, username: name.toLowerCase(), displayName: name },
    createdAt: "",
    updatedAt: ""
  });
  return {
    id: "group-1",
    name: "Roommates",
    ownerUserId: "user-1",
    isArchived: false,
    members: [member("user-1", "Jane", "admin"), member("user-2", "Sam", "member")],
    categories: [],
    createdAt: "",
    updatedAt: "",
    ...overrides
  } as Group;
}

const ACCOUNTS = [
  { id: "acc-1", name: "Checking", type: "checking", currency: "USD", initialBalance: 0, isArchived: false, createdAt: "", updatedAt: "" },
  { id: "acc-2", name: "Savings", type: "savings", currency: "EUR", initialBalance: 0, isArchived: false, createdAt: "", updatedAt: "" }
];
const CATEGORIES = [
  { id: "cat-1", name: "Groceries", type: "expense", isArchived: false, createdAt: "", updatedAt: "" },
  { id: "cat-2", name: "Salary", type: "income", isArchived: false, createdAt: "", updatedAt: "" }
];

function mockBaseline({
  transaction = makeTransaction() as Transaction | null,
  groups = [] as Group[]
} = {}) {
  server.use(
    http.post(`${API_URL}/auth/refresh`, () =>
      HttpResponse.json({
        token: "tok",
        user: {
          id: "user-1",
          name: "Jane",
          email: "jane@example.com",
          planType: "free",
          mobileSidebarSide: "left",
          createdAt: "",
          updatedAt: ""
        }
      })
    ),
    http.get(`${API_URL}/transactions/tx-1`, () =>
      transaction
        ? HttpResponse.json({ transaction })
        : HttpResponse.json({ message: "Transaction not found" }, { status: 404 })
    ),
    http.get(`${API_URL}/accounts`, () => HttpResponse.json({ accounts: ACCOUNTS })),
    http.get(`${API_URL}/categories`, () => HttpResponse.json({ categories: CATEGORIES })),
    http.get(`${API_URL}/groups`, () => HttpResponse.json({ groups })),
    http.get(`${API_URL}/currencies`, () =>
      HttpResponse.json({
        currencies: [{ code: "USD", name: "US Dollar" }],
        fiat: [{ code: "USD", name: "US Dollar" }],
        crypto: []
      })
    )
  );
}

function mockPut(response: () => Response) {
  const state: { body: Record<string, unknown> | null; calls: number } = { body: null, calls: 0 };
  server.use(
    http.put(`${API_URL}/transactions/tx-1`, async ({ request }) => {
      state.calls += 1;
      state.body = (await request.json()) as Record<string, unknown>;
      return response();
    })
  );
  return state;
}

function mockPost(response: () => Response) {
  const state: { body: Record<string, unknown> | null; calls: number } = { body: null, calls: 0 };
  server.use(
    http.post(`${API_URL}/transactions`, async ({ request }) => {
      state.calls += 1;
      state.body = (await request.json()) as Record<string, unknown>;
      return response();
    })
  );
  return state;
}

function renderPage(entry = "/transactions/tx-1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <AuthProvider>
          <Routes>
            <Route path="/transactions" element={<div>Transactions list</div>} />
            <Route path="/transactions/new" element={<TransactionDetailPage />} />
            <Route path="/transactions/:id" element={<TransactionDetailPage />} />
            <Route path="/transactions/:id/edit" element={<TransactionEditRedirect />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const saveButton = () => screen.getByRole("button", { name: "Save" });
const discardButton = () => screen.getByRole("button", { name: "Discard" });
const setDate = (value: string) =>
  fireEvent.change(screen.getByLabelText("Date and time"), { target: { value } });

async function loaded() {
  await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Groceries"));
}

describe("TransactionDetailPage (existing transaction)", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "America/Mexico_City";
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.env.TZ = originalTz;
  });

  it("shows a loading message before the transaction loads", () => {
    mockBaseline();
    renderPage();
    expect(screen.getByText("Loading transaction...")).toBeInTheDocument();
  });

  it("pre-fills the fields without an Edit button", async () => {
    mockBaseline();
    renderPage();

    await loaded();
    expect(screen.getByLabelText("Amount")).toHaveValue(42.5);
    expect(screen.getByLabelText("Date and time")).toHaveValue("2026-05-31T15:33");
    expect(screen.getByRole("heading", { name: "Groceries" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(discardButton()).toBeDisabled();
  });

  it("enables Save and Discard on the first change", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderPage();

    await loaded();
    await user.type(screen.getByLabelText("Notes"), "n");

    expect(saveButton()).toBeEnabled();
    expect(discardButton()).toBeEnabled();
  });

  it("sends one update with every changed field, then stays on the view", async () => {
    mockBaseline();
    const put = mockPut(() => HttpResponse.json({ transaction: makeTransaction() }));
    const user = userEvent.setup();
    renderPage();

    await loaded();
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "New name");
    await user.selectOptions(screen.getByLabelText("Account"), "acc-2");
    await user.click(saveButton());

    await waitFor(() => expect(put.calls).toBe(1));
    expect(put.body).toMatchObject({ name: "New name", accountId: "acc-2", executionCurrency: "EUR" });
    expect(put.body).not.toHaveProperty("amount");
    expect(put.body).not.toHaveProperty("sharedExpense");
    expect(screen.queryByText("Transactions list")).not.toBeInTheDocument();
  });

  it("Discard restores the stored values and disables Save and Discard", async () => {
    mockBaseline();
    const put = mockPut(() => HttpResponse.json({ transaction: makeTransaction() }));
    const user = userEvent.setup();
    renderPage();

    await loaded();
    await user.type(screen.getByLabelText("Name"), "!");
    await user.click(discardButton());
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.getByLabelText("Name")).toHaveValue("Groceries");
    expect(saveButton()).toBeDisabled();
    expect(discardButton()).toBeDisabled();
    expect(put.calls).toBe(0);
  });

  it("shows not-found for a missing or foreign transaction", async () => {
    mockBaseline({ transaction: null });
    renderPage();

    expect(await screen.findByRole("heading", { name: "Transaction not found" })).toBeInTheDocument();
  });

  it("shows a pending-classification message when account/category is missing", async () => {
    mockBaseline({ transaction: makeTransaction({ categoryId: null, category: null }) });
    renderPage();

    expect(
      await screen.findByText("Pending classification: add a category and account.")
    ).toBeInTheDocument();
  });

  it("shows From/To account fields for a transfer", async () => {
    mockBaseline({
      transaction: makeTransaction({
        type: "transfer",
        categoryId: null,
        category: null,
        transferToAccountId: "acc-2"
      })
    });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText("From account")).toHaveValue("acc-1"));
    expect(screen.getByLabelText("To account")).toHaveValue("acc-2");
  });

  it("shows the amount in the user's currency when it differs", async () => {
    mockBaseline({ transaction: makeTransaction({ executionCurrency: "EUR", amountInPreferredCurrency: 46 }) });
    server.use(
      http.post(`${API_URL}/auth/refresh`, () =>
        HttpResponse.json({
          token: "tok",
          user: {
            id: "user-1",
            name: "Jane",
            email: "jane@example.com",
            preferredCurrency: "USD",
            planType: "free",
            mobileSidebarSide: "left",
            createdAt: "",
            updatedAt: ""
          }
        })
      )
    );
    renderPage();

    expect(await screen.findByText("$46.00")).toBeInTheDocument();
  });

  it("deletes the transaction after confirmation and navigates back to the list", async () => {
    mockBaseline();
    let deleted = false;
    server.use(
      http.delete(`${API_URL}/transactions/tx-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    renderPage();

    await loaded();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleted).toBe(true));
    expect(await screen.findByText("Transactions list")).toBeInTheDocument();
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
    renderPage();

    await loaded();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleted).toBe(false);
  });

  it("Reset to now sets the field to the current local date and time", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderPage();
    await loaded();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-11-06T03:07:00.000Z"));

    await user.click(screen.getByRole("button", { name: "Reset to now" }));

    expect(screen.getByLabelText("Date and time")).toHaveValue("2026-11-05T21:07");
  });

  describe("date in the update request", () => {
    async function saveWithDate(
      change: (() => void) | null,
      transaction: Transaction = makeTransaction()
    ) {
      mockBaseline({ transaction });
      const put = mockPut(() => HttpResponse.json({ transaction }));
      const user = userEvent.setup();
      renderPage();
      await loaded();
      change?.();
      await user.type(screen.getByLabelText("Notes"), "n");
      await user.click(saveButton());
      await waitFor(() => expect(put.calls).toBe(1));
      return put.body!;
    }

    it("omits date when the field is unchanged", async () => {
      expect(await saveWithDate(null)).not.toHaveProperty("date");
    });

    it("omits date when the field is changed and restored", async () => {
      const body = await saveWithDate(() => {
        setDate("2026-06-02T15:33");
        setDate("2026-05-31T15:33");
      });
      expect(body).not.toHaveProperty("date");
    });

    it("keeps the local time and sub-minute precision when only the date changes", async () => {
      const body = await saveWithDate(() => setDate("2026-06-02T15:33"));
      expect(body.date).toBe("2026-06-02T21:33:15.979Z");
    });

    it("keeps the local date and sub-minute precision when only the time changes", async () => {
      const body = await saveWithDate(() => setDate("2026-05-31T16:45"));
      expect(body.date).toBe("2026-05-31T22:45:15.979Z");
    });

    it("keeps the local time of day across a DST change", async () => {
      process.env.TZ = "America/Los_Angeles";
      const body = await saveWithDate(
        () => setDate("2026-03-09T09:00"),
        makeTransaction({ date: "2026-03-07T17:00:00.000Z" })
      );
      expect(body.date).toBe("2026-03-09T16:00:00.000Z");
    });
  });

  describe("date display", () => {
    it.each(["America/Mexico_City", "Pacific/Kiritimati"])(
      "shows the local date and time in %s",
      async (zone) => {
        process.env.TZ = zone;
        const date = "2026-11-06T03:00:00.000Z";
        mockBaseline({ transaction: makeTransaction({ date }) });
        renderPage();

        const expected = new Date(date).toLocaleString(undefined, {
          timeZone: zone,
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit"
        });
        expect(await screen.findByText(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeInTheDocument();
      }
    );

    it("shows no time for an unedited provider date at UTC noon", async () => {
      const date = "2026-06-04T12:00:00.000Z";
      mockBaseline({ transaction: makeTransaction({ date, providerImportedTransaction: { transactionDate: date } }) });
      renderPage();

      const shown = new Date(date).toLocaleDateString(undefined, { timeZone: "America/Mexico_City" });
      expect(await screen.findByText(new RegExp(`· ${shown.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`))).toBeInTheDocument();
    });
  });

  describe("coupled fields", () => {
    it("switching to transfer shows From/To fields and hides category and group", async () => {
      mockBaseline();
      const user = userEvent.setup();
      renderPage();

      await loaded();
      await user.selectOptions(screen.getByLabelText("Type"), "transfer");

      expect(screen.getByLabelText("From account")).toBeInTheDocument();
      expect(screen.getByLabelText("To account")).toBeInTheDocument();
      expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Group")).not.toBeInTheDocument();
    });

    it("blocks Save and flags the destination for a transfer without a To account", async () => {
      mockBaseline();
      const put = mockPut(() => HttpResponse.json({ transaction: makeTransaction() }));
      const user = userEvent.setup();
      renderPage();

      await loaded();
      await user.selectOptions(screen.getByLabelText("Type"), "transfer");
      await user.click(saveButton());

      expect(await screen.findByText("To account is required for transfers")).toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
      expect(put.calls).toBe(0);
    });

    it("excludes the other transfer account from each dropdown", async () => {
      mockBaseline();
      const user = userEvent.setup();
      renderPage();

      await loaded();
      await user.selectOptions(screen.getByLabelText("Type"), "transfer");
      await user.selectOptions(screen.getByLabelText("To account"), "acc-2");

      expect(within(screen.getByLabelText("From account")).queryByRole("option", { name: "Savings" })).not.toBeInTheDocument();
      expect(within(screen.getByLabelText("To account")).queryByRole("option", { name: "Checking" })).not.toBeInTheDocument();
    });

    it("sends the type-coupled fields when switching to transfer", async () => {
      mockBaseline();
      const put = mockPut(() => HttpResponse.json({ transaction: makeTransaction() }));
      const user = userEvent.setup();
      renderPage();

      await loaded();
      await user.selectOptions(screen.getByLabelText("Type"), "transfer");
      await user.selectOptions(screen.getByLabelText("To account"), "acc-2");
      await user.click(saveButton());

      await waitFor(() => expect(put.calls).toBe(1));
      expect(put.body).toMatchObject({
        type: "transfer",
        transferToAccountId: "acc-2",
        categoryId: null,
        groupId: null
      });
    });

    it("only shows categories matching the selected transaction type", async () => {
      mockBaseline();
      renderPage();

      await waitFor(() => expect(screen.getByLabelText("Category")).toHaveValue("cat-1"));
      expect(screen.getByRole("option", { name: "Groceries" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Salary" })).not.toBeInTheDocument();
    });

    it("switching type clears a category that no longer matches", async () => {
      mockBaseline();
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => expect(screen.getByLabelText("Category")).toHaveValue("cat-1"));
      await user.selectOptions(screen.getByLabelText("Type"), "income");

      expect(screen.getByLabelText("Category")).toHaveValue("");
    });

    it("selecting a group clears the category", async () => {
      mockBaseline({ groups: [makeGroup()] });
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => expect(screen.getByLabelText("Category")).toHaveValue("cat-1"));
      await user.selectOptions(screen.getByLabelText("Group"), "group-1");

      expect(screen.getByLabelText("Category")).toHaveValue("");
    });
  });

  describe("validation and server errors", () => {
    it("shows the server's amount error on the amount field and keeps the draft", async () => {
      mockBaseline();
      const put = mockPut(() =>
        HttpResponse.json(
          {
            message: "Amount cannot be below the sum of participant shares",
            issues: { formErrors: [], fieldErrors: { amount: ["Amount cannot be below the sum of participant shares"] } }
          },
          { status: 400 }
        )
      );
      const user = userEvent.setup();
      renderPage();

      await loaded();
      await user.clear(screen.getByLabelText("Amount"));
      await user.type(screen.getByLabelText("Amount"), "5");
      await user.click(saveButton());

      await waitFor(() => expect(put.calls).toBe(1));
      expect((await screen.findAllByText("Amount cannot be below the sum of participant shares")).length).toBeGreaterThan(0);
      expect(screen.getByLabelText("Amount")).toHaveValue(5);
    });

    it("keeps the draft and allows a retry after a network failure", async () => {
      mockBaseline();
      let fail = true;
      const put = mockPut(() =>
        fail ? HttpResponse.error() : HttpResponse.json({ transaction: makeTransaction() })
      );
      const user = userEvent.setup();
      renderPage();

      await loaded();
      await user.type(screen.getByLabelText("Notes"), "n");
      await user.click(saveButton());
      await waitFor(() => expect(put.calls).toBe(1));
      await waitFor(() => expect(saveButton()).toBeEnabled());
      expect(screen.getByLabelText("Notes")).toHaveValue("n");

      fail = false;
      await user.click(saveButton());
      await waitFor(() => expect(put.calls).toBe(2));
    });
  });

  describe("tabs", () => {
    it("keeps unsaved edits across a tab switch", async () => {
      mockBaseline();
      const user = userEvent.setup();
      renderPage();

      await loaded();
      await user.type(screen.getByLabelText("Notes"), "hello");
      await user.click(screen.getByRole("tab", { name: "Sharing" }));
      await user.click(screen.getByRole("tab", { name: "Details" }));

      expect(screen.getByLabelText("Notes")).toHaveValue("hello");
    });

    it("shows the shared expense's participants read-only", async () => {
      mockBaseline({
        transaction: makeTransaction({
          sharedExpense: {
            id: "se-1",
            transactionId: "tx-1",
            ownerUserId: "user-1",
            title: "Dinner split",
            totalAmount: 42.5,
            status: "open",
            participants: [
              { id: "p1", participantName: "Sam", currency: "USD", shareAmount: 20, paidAmount: 10, status: "partial" }
            ],
            createdAt: "",
            updatedAt: ""
          } as Transaction["sharedExpense"]
        })
      });
      const user = userEvent.setup();
      renderPage();

      await loaded();
      await user.click(screen.getByRole("tab", { name: "Sharing" }));

      expect(screen.getByText("Dinner split")).toBeInTheDocument();
      expect(screen.getByText("Sam")).toBeInTheDocument();
      expect(screen.getByText("$20.00")).toBeInTheDocument();
      expect(screen.getByText("$10.00")).toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: "Shared transaction" })).not.toBeInTheDocument();
    });

    it("says no shared expense is attached when there is none", async () => {
      mockBaseline();
      const user = userEvent.setup();
      renderPage();

      await loaded();
      await user.click(screen.getByRole("tab", { name: "Sharing" }));

      expect(screen.getByText("No shared expense is attached.")).toBeInTheDocument();
    });

    it("hides the Related tab when there are no related records", async () => {
      mockBaseline();
      renderPage();

      await loaded();
      expect(screen.queryByRole("tab", { name: "Related" })).not.toBeInTheDocument();
    });

    it("lists settlement transactions and the imported source in the Related tab", async () => {
      const settlement = (id: string) => makeTransaction({ id, name: `Settlement ${id}`, amount: 10 });
      mockBaseline({
        transaction: makeTransaction({
          relations: [{ id: "r1", relationType: "settlement_payment", relatedTransaction: settlement("tx-2") }],
          relatedBy: [{ id: "r2", relationType: "settlement_payment", transaction: settlement("tx-3") }],
          providerImportedTransaction: { transactionDate: "2026-05-31T12:00:00.000Z" }
        })
      });
      const user = userEvent.setup();
      renderPage();

      await loaded();
      await user.click(screen.getByRole("tab", { name: "Related" }));

      expect(screen.getByRole("link", { name: "Settlement tx-2" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Settlement tx-3" })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Imported from provider" })).toBeInTheDocument();
    });
  });

  it("redirects the legacy /edit URL to the editable view", async () => {
    mockBaseline();
    renderPage("/transactions/tx-1/edit");

    await loaded();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("stacks the field grid in one column by default for narrow screens", async () => {
    mockBaseline();
    renderPage();

    await loaded();
    const grid = screen.getByLabelText("Name").closest(".grid");
    expect(grid).toHaveClass("grid-cols-1");
    expect(screen.getByLabelText("Name").className).toContain("text-base");
  });
});

describe("TransactionDetailPage (new draft)", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "America/Mexico_City";
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.env.TZ = originalTz;
  });

  async function openNew(entry = "/transactions/new") {
    mockBaseline({ groups: [makeGroup()] });
    renderPage(entry);
    await screen.findByLabelText("Name");
  }

  it("opens an empty draft with Save disabled and nothing created", async () => {
    const post = mockPost(() => HttpResponse.json({ transaction: makeTransaction() }));
    await openNew();

    expect(screen.getByRole("heading", { name: "New transaction" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(saveButton()).toBeDisabled();
    expect(post.calls).toBe(0);
  });

  it("defaults the date and time to now", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T03:07:00.000Z"));
    await openNew();

    expect(screen.getByLabelText("Date and time")).toHaveValue("2026-11-05T21:07");
  });

  it("prefills from whitelisted query params and ignores invalid ones", async () => {
    const post = mockPost(() => HttpResponse.json({ transaction: makeTransaction() }));
    await openNew("/transactions/new?type=expense&amount=25&description=Lunch&bogus=1&currency=USD&categoryId=cat-1");

    expect(screen.getByLabelText("Name")).toHaveValue("Lunch");
    expect(screen.getByLabelText("Amount")).toHaveValue(25);
    expect(screen.getByLabelText("Category")).toHaveValue("cat-1");
    expect(post.calls).toBe(0);
  });

  it("ignores amount=abc and an unknown type", async () => {
    await openNew("/transactions/new?amount=abc&type=nope");

    expect(screen.getByLabelText("Amount")).toHaveValue(null);
    expect(screen.getByLabelText("Type")).toHaveValue("expense");
  });

  it("takes the currency from a prefilled account", async () => {
    await openNew("/transactions/new?accountId=acc-2");

    expect(screen.getByLabelText("Account")).toHaveValue("acc-2");
    expect(await screen.findByRole("combobox", { name: /currency/i })).toHaveValue("EUR");
  });

  it("Discard on a prefilled draft creates nothing", async () => {
    const post = mockPost(() => HttpResponse.json({ transaction: makeTransaction() }));
    const user = userEvent.setup();
    await openNew("/transactions/new?description=Lunch");

    await user.type(screen.getByLabelText("Amount"), "5");
    await user.click(discardButton());
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.getByLabelText("Amount")).toHaveValue(null);
    expect(post.calls).toBe(0);
  });

  it("sends the entered local date and time as a UTC instant and lands on the new transaction", async () => {
    const post = mockPost(() =>
      HttpResponse.json({ transaction: makeTransaction({ id: "tx-1", name: "Dinner" }) })
    );
    const user = userEvent.setup();
    await openNew();
    server.use(
      http.get(`${API_URL}/transactions/tx-1`, () =>
        HttpResponse.json({ transaction: makeTransaction({ name: "Dinner" }) })
      )
    );

    await user.type(screen.getByLabelText("Name"), "Dinner");
    await user.type(screen.getByLabelText("Amount"), "10");
    setDate("2026-11-05T14:30");
    await user.click(saveButton());

    await waitFor(() => expect(post.calls).toBe(1));
    expect(post.body).toMatchObject({ name: "Dinner", amount: 10, type: "expense", date: "2026-11-05T20:30:00.000Z" });
    expect(post.body).not.toHaveProperty("sharedExpense");
    expect(await screen.findByRole("heading", { name: "Dinner" })).toBeInTheDocument();
  });

  it("blocks Save for a transfer with no From/To accounts", async () => {
    const post = mockPost(() => HttpResponse.json({ transaction: makeTransaction() }));
    const user = userEvent.setup();
    await openNew();

    await user.type(screen.getByLabelText("Name"), "Move");
    await user.type(screen.getByLabelText("Amount"), "10");
    await user.selectOptions(screen.getByLabelText("Type"), "transfer");
    await user.click(saveButton());

    expect(await screen.findByText("To account is required for transfers")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(post.calls).toBe(0);
  });

  it("selecting a group suggests an equal split excluding the current user", async () => {
    const user = userEvent.setup();
    await openNew();

    await user.type(screen.getByLabelText("Amount"), "100");
    await user.selectOptions(screen.getByLabelText("Group"), "group-1");
    await user.click(screen.getByRole("tab", { name: "Sharing" }));

    expect(await screen.findByText("Sam (@sam)")).toBeInTheDocument();
    expect(screen.queryByText("Jane (@jane)")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Share")).toHaveValue(50);
  });

  it("recalculates the group split when the amount changes afterward", async () => {
    const user = userEvent.setup();
    await openNew();

    await user.type(screen.getByLabelText("Amount"), "100");
    await user.selectOptions(screen.getByLabelText("Group"), "group-1");
    await user.type(screen.getByLabelText("Amount"), "0");
    await user.click(screen.getByRole("tab", { name: "Sharing" }));

    expect(await screen.findByLabelText("Share")).toHaveValue(500);
  });

  it("creates a shared transaction with one POST carrying the sharedExpense", async () => {
    const post = mockPost(() => HttpResponse.json({ transaction: makeTransaction({ id: "tx-1", name: "Dinner" }) }));
    const user = userEvent.setup();
    await openNew();

    await user.type(screen.getByLabelText("Name"), "Dinner");
    await user.type(screen.getByLabelText("Amount"), "100");
    await user.selectOptions(screen.getByLabelText("Group"), "group-1");
    await user.click(screen.getByRole("tab", { name: "Sharing" }));
    await screen.findByText("Sam (@sam)");
    await user.click(saveButton());

    await waitFor(() => expect(post.calls).toBe(1));
    const shared = post.body?.sharedExpense as { title: string; participants: unknown[] };
    expect(shared.title).toBe("Dinner");
    expect(shared.participants).toEqual([
      { userId: "user-2", participantName: "Sam (@sam)", shareAmount: 50, paidAmount: 0, status: "pending" }
    ]);
  });

  it("keeps the draft and shows the error when create fails", async () => {
    const post = mockPost(() => HttpResponse.json({ message: "Boom" }, { status: 500 }));
    const user = userEvent.setup();
    await openNew();

    await user.type(screen.getByLabelText("Name"), "Dinner");
    await user.type(screen.getByLabelText("Amount"), "10");
    await user.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Boom");
    expect(post.calls).toBe(1);
    expect(screen.getByLabelText("Name")).toHaveValue("Dinner");
    expect(saveButton()).toBeEnabled();
  });

  it("blocks Save for a shared draft with no participants", async () => {
    const post = mockPost(() => HttpResponse.json({ transaction: makeTransaction() }));
    const user = userEvent.setup();
    await openNew();

    await user.type(screen.getByLabelText("Name"), "Dinner");
    await user.type(screen.getByLabelText("Amount"), "10");
    await user.click(screen.getByRole("tab", { name: "Sharing" }));
    await user.click(screen.getByRole("checkbox", { name: "Shared transaction" }));
    await user.click(saveButton());

    expect(await screen.findByText("Add at least one participant to share this transaction")).toBeInTheDocument();
    expect(post.calls).toBe(0);
  });

  it("omits the sharing controls for a transfer", async () => {
    const user = userEvent.setup();
    await openNew();

    await user.selectOptions(screen.getByLabelText("Type"), "transfer");
    await user.click(screen.getByRole("tab", { name: "Sharing" }));

    expect(screen.queryByRole("checkbox", { name: "Shared transaction" })).not.toBeInTheDocument();
  });

  it("clears participants when a draft switches to transfer", async () => {
    const user = userEvent.setup();
    await openNew();

    await user.type(screen.getByLabelText("Amount"), "100");
    await user.selectOptions(screen.getByLabelText("Group"), "group-1");
    await user.selectOptions(screen.getByLabelText("Type"), "transfer");
    await user.selectOptions(screen.getByLabelText("Type"), "expense");
    await user.click(screen.getByRole("tab", { name: "Sharing" }));

    expect(screen.getByRole("checkbox", { name: "Shared transaction" })).not.toBeChecked();
  });
});
