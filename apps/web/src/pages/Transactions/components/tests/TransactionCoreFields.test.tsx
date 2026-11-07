import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { server } from "../../../../tests/mocks/server";
import type { Account } from "../../../../types/accounts.types";
import type { Category } from "../../../../types/categories.types";
import type { Group } from "../../../../types/groups.types";
import type { TransactionFormState } from "../../types/transactions.types";
import { TransactionCoreFields } from "../TransactionCoreFields";

const API_URL = "http://localhost:4000";

function makeForm(overrides: Partial<TransactionFormState> = {}): TransactionFormState {
  return {
    name: "",
    amount: "",
    executionCurrency: "USD",
    type: "expense",
    date: "2024-01-15T09:30",
    accountId: "",
    transferToAccountId: "",
    categoryId: "",
    groupId: "",
    notes: "",
    isShared: false,
    sharedTitle: "",
    ...overrides
  };
}

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

function baseProps(overrides: Partial<Parameters<typeof TransactionCoreFields>[0]> = {}) {
  return {
    form: makeForm(),
    onFormChange: vi.fn(),
    onSwitchedToTransfer: vi.fn(),
    onAmountChanged: vi.fn(),
    onGroupSelected: vi.fn(),
    accounts: [makeAccount(), makeAccount({ id: "acc-2", name: "Savings" })],
    groups: [] as Group[],
    categoryOptions: [] as Category[],
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
    )
  );
}

describe("TransactionCoreFields", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it("renders Account (not From/To) fields for a non-transfer type", () => {
    mockCurrencies();
    renderWithProviders(<TransactionCoreFields {...baseProps()} />);
    expect(screen.getByLabelText("Account")).toBeInTheDocument();
    expect(screen.queryByLabelText("From account")).not.toBeInTheDocument();
  });

  it("calls onFormChange when the name/amount/date fields change", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<TransactionCoreFields {...props} />);

    await user.type(screen.getByLabelText("Name"), "a");
    expect(props.onFormChange).toHaveBeenCalled();
  });

  it("selecting an account also sets executionCurrency to that account's currency", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps({
      accounts: [makeAccount({ id: "acc-eur", name: "Euro account", currency: "EUR" })]
    });
    renderWithProviders(<TransactionCoreFields {...props} />);

    await user.selectOptions(screen.getByLabelText("Account"), "acc-eur");

    expect(props.onFormChange).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acc-eur", executionCurrency: "EUR" })
    );
  });

  it("shows From/To account fields and hides category/group when type is transfer, calling onSwitchedToTransfer", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<TransactionCoreFields {...props} />);

    await user.selectOptions(screen.getByLabelText("Type"), "transfer");

    expect(props.onSwitchedToTransfer).toHaveBeenCalledOnce();
    expect(props.onFormChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: "transfer", categoryId: "", groupId: "", isShared: false })
    );
  });

  it("shows a validation message when From and To accounts match", () => {
    mockCurrencies();
    const props = baseProps({
      form: makeForm({ type: "transfer", accountId: "acc-1", transferToAccountId: "acc-1" })
    });
    renderWithProviders(<TransactionCoreFields {...props} />);

    expect(
      screen.getByText("Source and destination accounts must be different")
    ).toBeInTheDocument();
  });

  it("excludes the selected From account from the To account options and vice versa", () => {
    mockCurrencies();
    const props = baseProps({ form: makeForm({ type: "transfer", accountId: "acc-1" }) });
    renderWithProviders(<TransactionCoreFields {...props} />);

    const toOptions = screen.getByLabelText("To account").querySelectorAll("option");
    const toOptionValues = Array.from(toOptions).map((option) => option.getAttribute("value"));
    expect(toOptionValues).not.toContain("acc-1");
  });

  it("selecting a category calls onFormChange with the categoryId", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps({
      categoryOptions: [
        { id: "cat-1", name: "Groceries", type: "expense", isArchived: false, createdAt: "", updatedAt: "" }
      ]
    });
    renderWithProviders(<TransactionCoreFields {...props} />);

    await user.selectOptions(screen.getByLabelText("Category"), "cat-1");

    expect(props.onFormChange).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: "cat-1" })
    );
  });

  it("only shows categories matching the selected transaction type", () => {
    mockCurrencies();
    const props = baseProps({
      form: makeForm({ type: "expense" }),
      categoryOptions: [
        { id: "cat-expense", name: "Groceries", type: "expense", isArchived: false, createdAt: "", updatedAt: "" },
        { id: "cat-income", name: "Salary", type: "income", isArchived: false, createdAt: "", updatedAt: "" }
      ]
    });
    renderWithProviders(<TransactionCoreFields {...props} />);

    expect(screen.getByRole("option", { name: "Groceries" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Salary" })).not.toBeInTheDocument();
  });

  it("switching type clears a categoryId that no longer matches the new type", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps({
      form: makeForm({ type: "expense", categoryId: "cat-expense" }),
      categoryOptions: [
        { id: "cat-expense", name: "Groceries", type: "expense", isArchived: false, createdAt: "", updatedAt: "" },
        { id: "cat-income", name: "Salary", type: "income", isArchived: false, createdAt: "", updatedAt: "" }
      ]
    });
    renderWithProviders(<TransactionCoreFields {...props} />);

    await user.selectOptions(screen.getByLabelText("Type"), "income");

    expect(props.onFormChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: "income", categoryId: "" })
    );
  });

  it("selecting a group clears categoryId, marks isShared, and calls onGroupSelected", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const group: Group = {
      id: "group-1",
      name: "Roommates",
      ownerUserId: "user-1",
      isArchived: false,
      members: [],
      categories: [],
      createdAt: "",
      updatedAt: ""
    };
    const props = baseProps({
      form: makeForm({ categoryId: "cat-1" }),
      groups: [group]
    });
    renderWithProviders(<TransactionCoreFields {...props} />);

    await user.selectOptions(screen.getByLabelText("Group"), "group-1");

    expect(props.onFormChange).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "group-1", categoryId: "", isShared: true })
    );
    expect(props.onGroupSelected).toHaveBeenCalledWith(group);
  });

  it("labels a single datetime-local field for date and time", () => {
    mockCurrencies();
    renderWithProviders(<TransactionCoreFields {...baseProps()} />);

    const field = screen.getByLabelText("Date and time");
    expect(field).toHaveAttribute("type", "datetime-local");
    expect(field).toHaveValue("2024-01-15T09:30");
    expect(screen.queryByLabelText("Date")).not.toBeInTheDocument();
  });

  it("reports a changed date-and-time value through onFormChange", () => {
    mockCurrencies();
    const props = baseProps();
    renderWithProviders(<TransactionCoreFields {...props} />);

    fireEvent.change(screen.getByLabelText("Date and time"), {
      target: { value: "2026-11-05T14:30" }
    });

    expect(props.onFormChange).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-11-05T14:30" })
    );
  });

  it("Reset to now sets the field to the current local date and time regardless of its current value", async () => {
    process.env.TZ = "America/Mexico_City";
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-11-06T03:07:00.000Z"));
    mockCurrencies();
    const user = userEvent.setup({ delay: null });
    const props = baseProps();
    renderWithProviders(<TransactionCoreFields {...props} />);

    await user.click(screen.getByRole("button", { name: "Reset to now" }));

    expect(props.onFormChange).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-11-05T21:07" })
    );
  });

  it("shows the transfer-specific notes helper text only for transfer type", () => {
    mockCurrencies();
    renderWithProviders(
      <TransactionCoreFields {...baseProps({ form: makeForm({ type: "transfer" }) })} />
    );
    expect(
      screen.getByText(/Transfers move money between your own accounts/)
    ).toBeInTheDocument();
  });
});
