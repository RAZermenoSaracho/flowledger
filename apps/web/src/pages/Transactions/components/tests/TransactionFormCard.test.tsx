import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { server } from "../../../../tests/mocks/server";
import type { Account } from "../../../../types/accounts.types";
import type { Group } from "../../../../types/groups.types";
import { TransactionFormCard } from "../TransactionFormCard";

const API_URL = "http://localhost:4000";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc-1",
    name: "Checking",
    type: "checking",
    currency: "USD",
    initialBalance: 0,
    isArchived: false,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: "group-1",
    name: "Roommates",
    ownerUserId: "user-1",
    isArchived: false,
    members: [
      {
        id: "m1",
        groupId: "group-1",
        userId: "user-1",
        role: "admin",
        user: { id: "user-1", name: "Jane", email: "jane@example.com" },
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "m2",
        groupId: "group-1",
        userId: "user-2",
        role: "member",
        user: { id: "user-2", name: "Sam", email: "sam@example.com" },
        createdAt: "",
        updatedAt: ""
      }
    ],
    categories: [],
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function mockCurrencies() {
  server.use(
    http.get(`${API_URL}/currencies`, () =>
      HttpResponse.json({
        currencies: [{ code: "USD", name: "US Dollar" }],
        fiat: [{ code: "USD", name: "US Dollar" }],
        crypto: []
      })
    ),
    // Authed as the group's owner ("user-1"/Jane) — suggestEqualGroupSplit
    // excludes the current viewer from the suggested split, so this must be
    // mocked for the split-suggestion tests to exclude the right person.
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
    )
  );
}

function baseProps(overrides: Partial<Parameters<typeof TransactionFormCard>[0]> = {}) {
  return {
    isOpen: true,
    onClose: vi.fn(),
    accounts: [makeAccount()],
    groups: [makeGroup()],
    personalCategories: [],
    defaultCurrency: "USD",
    onCreated: vi.fn(async () => {}),
    ...overrides
  };
}

describe("TransactionFormCard", () => {
  it("renders nothing when isOpen is false", () => {
    mockCurrencies();
    renderWithProviders(<TransactionFormCard {...baseProps({ isOpen: false })} />, {
      withAuth: true
    });
    expect(screen.queryByText("New transaction")).not.toBeInTheDocument();
  });

  it("calls onClose (via Cancel) without submitting", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<TransactionFormCard {...props} />, { withAuth: true });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("places Cancel next to Save transaction at the end of the form, not in the header", () => {
    mockCurrencies();
    renderWithProviders(<TransactionFormCard {...baseProps()} />, { withAuth: true });

    const saveButton = screen.getByRole("button", { name: "Save transaction" });
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(saveButton.compareDocumentPosition(cancelButton)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(cancelButton.closest("form")).not.toBeNull();
  });

  it("defaults the date field to today's local date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 2, 5)); // March 5, 2024, local time
    mockCurrencies();
    renderWithProviders(<TransactionFormCard {...baseProps()} />, { withAuth: true });

    expect(screen.getByLabelText("Date")).toHaveValue("2024-03-05");
    vi.useRealTimers();
  });

  it("resets the date field to today after Cancel, even if it was changed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2024, 2, 5));
    mockCurrencies();
    const user = userEvent.setup({ delay: null });
    // onClose is a no-op spy — isOpen never flips, so the component stays
    // mounted and closeForm()'s setForm(emptyForm(...)) reset is observable
    // directly, the same way it would be if the parent re-opened the form.
    renderWithProviders(<TransactionFormCard {...baseProps()} />, { withAuth: true });

    await user.clear(screen.getByLabelText("Date"));
    await user.type(screen.getByLabelText("Date"), "2024-01-15");
    expect(screen.getByLabelText("Date")).toHaveValue("2024-01-15");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByLabelText("Date")).toHaveValue("2024-03-05");
    vi.useRealTimers();
  });

  it("submits the form and calls onCreated/onClose on success", async () => {
    mockCurrencies();
    let postedBody: unknown;
    server.use(
      http.post(`${API_URL}/transactions`, async ({ request }) => {
        postedBody = await request.json();
        return HttpResponse.json({
          transaction: { id: "tx-1", name: "Groceries", type: "expense", amount: 42.5 }
        });
      })
    );
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<TransactionFormCard {...props} />, { withAuth: true });

    await user.type(screen.getByLabelText("Name"), "Groceries");
    await user.type(screen.getByLabelText("Amount"), "42.5");
    await user.click(screen.getByRole("button", { name: "Save transaction" }));

    await waitFor(() => expect(props.onCreated).toHaveBeenCalled());
    expect(postedBody).toMatchObject({ name: "Groceries", amount: 42.5, type: "expense" });
    expect(props.onClose).toHaveBeenCalled();
  });

  it("disables submit for a transfer with no From/To accounts selected yet", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps({
      accounts: [makeAccount(), makeAccount({ id: "acc-2", name: "Savings" })]
    });
    renderWithProviders(<TransactionFormCard {...props} />, { withAuth: true });

    await user.selectOptions(screen.getByLabelText("Type"), "transfer");

    // TransactionCoreFields' From/To dropdowns are mutually exclusive by
    // construction (each excludes whatever the other already selected), so
    // "the same account in both" can't be reached through the UI — this
    // exercises the reachable case of the same accountId/transferToAccountId
    // validation: neither field filled in yet.
    expect(screen.getByRole("button", { name: "Save transaction" })).toBeDisabled();
  });

  it("selecting a group with a positive amount auto-suggests an equal split excluding the current user", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<TransactionFormCard {...props} />, { withAuth: true });

    await user.type(screen.getByLabelText("Amount"), "100");
    await user.selectOptions(screen.getByLabelText("Group"), "group-1");

    await waitFor(() => expect(screen.getByText("Sam")).toBeInTheDocument());
    expect(screen.queryByText("Jane")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Share")).toHaveValue(50);
  });

  it("recalculates the equal group split when the amount changes afterward", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<TransactionFormCard {...props} />, { withAuth: true });

    await user.type(screen.getByLabelText("Amount"), "100");
    await user.selectOptions(screen.getByLabelText("Group"), "group-1");
    await waitFor(() => expect(screen.getByLabelText("Share")).toHaveValue(50));

    await user.type(screen.getByLabelText("Amount"), "0");

    await waitFor(() => expect(screen.getByLabelText("Share")).toHaveValue(500));
  });

  it("clears participant drafts when isShared is unchecked", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<TransactionFormCard {...props} />, { withAuth: true });

    await user.type(screen.getByLabelText("Amount"), "100");
    await user.selectOptions(screen.getByLabelText("Group"), "group-1");
    await waitFor(() => expect(screen.getByText("Sam")).toBeInTheDocument());

    await user.click(screen.getByRole("checkbox", { name: "Shared transaction" }));

    expect(screen.queryByText("Sam")).not.toBeInTheDocument();
  });

  it("disables submit for a shared transaction with no participants", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<TransactionFormCard {...props} />, { withAuth: true });

    await user.click(screen.getByRole("checkbox", { name: "Shared transaction" }));

    expect(screen.getByRole("button", { name: "Save transaction" })).toBeDisabled();
  });

  it("disables submit when a manually-entered participant share exceeds the transaction amount", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<TransactionFormCard {...props} />, { withAuth: true });

    await user.type(screen.getByLabelText("Amount"), "100");
    await user.click(screen.getByRole("checkbox", { name: "Shared transaction" }));
    await user.type(screen.getByLabelText("Manual participant"), "Sam");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.type(screen.getByLabelText("Share"), "150");

    expect(screen.getByRole("button", { name: "Save transaction" })).toBeDisabled();
    expect(
      screen.getByText(/Over by \$50\.00 — participant shares cannot exceed the transaction amount\./)
    ).toBeInTheDocument();
  });

  it("submits with a sharedExpense payload once participants are assigned", async () => {
    mockCurrencies();
    let postedBody: { sharedExpense?: { title: string; participants: unknown[] } } | undefined;
    server.use(
      http.post(`${API_URL}/transactions`, async ({ request }) => {
        postedBody = (await request.json()) as typeof postedBody;
        return HttpResponse.json({ transaction: { id: "tx-1" } });
      })
    );
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<TransactionFormCard {...props} />, { withAuth: true });

    await user.type(screen.getByLabelText("Name"), "Dinner");
    await user.type(screen.getByLabelText("Amount"), "100");
    await user.selectOptions(screen.getByLabelText("Group"), "group-1");
    await waitFor(() => expect(screen.getByText("Sam")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Save transaction" }));

    await waitFor(() => expect(postedBody?.sharedExpense).toBeDefined());
    expect(postedBody?.sharedExpense?.title).toBe("Dinner");
    expect(postedBody?.sharedExpense?.participants).toHaveLength(1);
  });

  it("omits the shared-participants section for a transfer", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    renderWithProviders(<TransactionFormCard {...baseProps()} />, { withAuth: true });

    await user.selectOptions(screen.getByLabelText("Type"), "transfer");

    expect(screen.queryByRole("checkbox", { name: "Shared transaction" })).not.toBeInTheDocument();
  });
});
