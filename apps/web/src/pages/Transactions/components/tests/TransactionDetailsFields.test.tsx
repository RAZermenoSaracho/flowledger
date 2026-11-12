import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { useFormDraft } from "../../../../hooks/useFormDraft";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Account } from "../../../../types/accounts.types";
import type { Category } from "../../../../types/categories.types";
import type { Group } from "../../../../types/groups.types";
import type { Transaction } from "../../../../types/transactions.types";
import type { TransactionDraft } from "../../types/transactions.types";
import { newTransactionDraft } from "../../utils/transactionDraft";
import { TransactionDetailsFields } from "../TransactionDetailsFields";

const accounts = [
  { id: "a1", name: "Checking", currency: "USD" },
  { id: "a2", name: "Savings", currency: "EUR" }
] as Account[];
const categories = [
  { id: "c1", name: "Food", type: "expense" },
  { id: "c2", name: "Pay", type: "income" }
] as Category[];
const groups = [
  {
    id: "g1",
    name: "Roommates",
    categories: [{ id: "gc1", name: "Rent", type: "expense" }],
    members: [
      {
        id: "m1",
        userId: "me",
        user: { id: "me", username: "me", displayName: "Me" }
      },
      {
        id: "m2",
        userId: "u2",
        user: { id: "u2", username: "sam", displayName: "Sam" }
      }
    ]
  }
] as unknown as Group[];

function Harness({
  initial,
  isNew = true,
  transaction = null,
  preferredCurrency
}: {
  initial: TransactionDraft;
  isNew?: boolean;
  transaction?: Transaction | null;
  preferredCurrency?: string;
}) {
  const draft = useFormDraft<TransactionDraft>({
    initial,
    validate: () => ({}),
    save: async () => {}
  });
  return (
    <>
      <TransactionDetailsFields
        draft={draft}
        isNew={isNew}
        transaction={transaction}
        accounts={accounts}
        categories={categories}
        groups={groups}
        currentUserId="me"
        preferredCurrency={preferredCurrency}
      />
      <output data-testid="values">{JSON.stringify(draft.values)}</output>
      <output data-testid="dirty">{draft.changedKeys.join(",")}</output>
    </>
  );
}

const initial = (overrides: Partial<TransactionDraft> = {}) => ({
  ...newTransactionDraft("USD", "2026-11-05T14:30"),
  ...overrides
});
const values = () =>
  JSON.parse(
    screen.getByTestId("values").textContent ?? "{}"
  ) as TransactionDraft;

function mockCurrencies() {
  server.use(
    http.get("http://localhost:4000/currencies", () =>
      HttpResponse.json({
        currencies: [],
        fiat: [{ code: "USD", name: "US Dollar" }],
        crypto: []
      })
    )
  );
}

describe("TransactionDetailsFields", () => {
  it("labels Account for an expense and From/To account for a transfer", () => {
    mockCurrencies();
    const { unmount } = renderWithProviders(<Harness initial={initial()} />);
    expect(screen.getByLabelText("Account")).toBeInTheDocument();
    expect(screen.queryByLabelText("To account")).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<Harness initial={initial({ type: "transfer" })} />);
    expect(screen.getByLabelText("From account")).toBeInTheDocument();
    expect(screen.getByLabelText("To account")).toBeInTheDocument();
    expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();
    expect(screen.getByText(/cannot be shared or split/)).toBeInTheDocument();
  });

  it("selecting an account sets the currency", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={initial()} />);

    await user.selectOptions(screen.getByLabelText("Account"), "a2");

    expect(values()).toMatchObject({
      accountId: "a2",
      executionCurrency: "EUR"
    });
  });

  it("only lists categories of the selected type, and the group's own once a group is chosen", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={initial()} />);

    expect(screen.getByRole("option", { name: "Food" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Pay" })
    ).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Group"), "g1");
    expect(screen.getByRole("option", { name: "Rent" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Food" })
    ).not.toBeInTheDocument();
  });

  it("a group on a new draft turns sharing on; on an existing transaction it does not", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(
      <Harness initial={initial({ amount: "10" })} />
    );
    await user.selectOptions(screen.getByLabelText("Group"), "g1");
    expect(values()).toMatchObject({ isShared: true });
    unmount();

    renderWithProviders(
      <Harness initial={initial({ amount: "10" })} isNew={false} />
    );
    await user.selectOptions(screen.getByLabelText("Group"), "g1");
    expect(values()).toMatchObject({
      groupId: "g1",
      isShared: false,
      participants: []
    });
  });

  it("marks only the edited field dirty", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={initial()} />);

    await user.type(screen.getByLabelText("Notes"), "x");

    expect(screen.getByTestId("dirty")).toHaveTextContent(/^notes$/);
  });

  it("Reset to now writes the current local time", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    renderWithProviders(
      <Harness initial={initial({ date: "2000-01-01T00:00" })} />
    );

    await user.click(screen.getByRole("button", { name: "Reset to now" }));

    expect(values().date).not.toBe("2000-01-01T00:00");
    expect(values().date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("shows the amount in the preferred currency only when it differs", () => {
    mockCurrencies();
    const tx = {
      executionCurrency: "EUR",
      amountInPreferredCurrency: 46
    } as Transaction;
    const { unmount } = renderWithProviders(
      <Harness
        initial={initial()}
        isNew={false}
        transaction={tx}
        preferredCurrency="USD"
      />
    );
    expect(screen.getByText("$46.00")).toBeInTheDocument();
    unmount();

    renderWithProviders(
      <Harness
        initial={initial()}
        isNew={false}
        transaction={tx}
        preferredCurrency="EUR"
      />
    );
    expect(
      screen.queryByText("Amount in your currency")
    ).not.toBeInTheDocument();
  });

  it("shows the provider import date for an imported transaction only", () => {
    mockCurrencies();
    const imported = {
      executionCurrency: "USD",
      providerImportedTransaction: {
        transactionDate: "2026-05-31T12:00:00.000Z"
      }
    } as Transaction;
    const { unmount } = renderWithProviders(
      <Harness initial={initial()} isNew={false} transaction={imported} />
    );
    expect(screen.getByText("Imported from provider")).toBeInTheDocument();
    unmount();

    renderWithProviders(
      <Harness
        initial={initial()}
        isNew={false}
        transaction={{ executionCurrency: "USD" } as Transaction}
      />
    );
    expect(
      screen.queryByText("Imported from provider")
    ).not.toBeInTheDocument();
  });
});
