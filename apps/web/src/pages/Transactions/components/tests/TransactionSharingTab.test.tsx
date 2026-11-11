import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { useFormDraft } from "../../../../hooks/useFormDraft";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Group } from "../../../../types/groups.types";
import type { Transaction } from "../../../../types/transactions.types";
import type { TransactionDraft } from "../../types/transactions.types";
import { newTransactionDraft } from "../../utils/transactionDraft";
import { TransactionSharingTab } from "../TransactionSharingTab";

const API_URL = "http://localhost:4000";
const group = {
  id: "g1",
  name: "Roommates",
  members: [
    { id: "m1", userId: "me", user: { id: "me", username: "me", displayName: "Me" } },
    { id: "m2", userId: "u2", user: { id: "u2", username: "sam", displayName: "Sam" } }
  ]
} as unknown as Group;

function Harness({
  initial,
  group: selected,
  transaction = null
}: {
  initial: TransactionDraft;
  group?: Group;
  transaction?: Transaction | null;
}) {
  const draft = useFormDraft<TransactionDraft>({ initial, validate: () => ({}), save: async () => {} });
  return (
    <>
      <TransactionSharingTab draft={draft} transaction={transaction} group={selected} currentUserId="me" />
      <output data-testid="values">{JSON.stringify(draft.values.participants.map((p) => p.shareAmount))}</output>
    </>
  );
}

const draft = (overrides: Partial<TransactionDraft> = {}) => ({
  ...newTransactionDraft("USD", "2026-11-05T14:30"),
  amount: "100",
  isShared: true,
  ...overrides
});
const row = (draftId: string, shareAmount: string) => ({
  draftId,
  participantName: `Person ${draftId}`,
  source: "manual" as const,
  shareAmount
});

describe("TransactionSharingTab", () => {
  it("hides the sharing fields until the toggle is on, and shows them once on", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={draft({ isShared: false })} />);

    expect(screen.queryByLabelText("Shared transaction title")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Shared transaction" }));
    expect(screen.getByLabelText("Shared transaction title")).toBeInTheDocument();
  });

  it("shows the totals footer and updates it as a share is edited", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={draft({ participants: [row("a", "30")] })} />);

    expect(screen.getByText("Allocated: $30.00")).toBeInTheDocument();
    expect(screen.getByText("Owner share: $70.00")).toBeInTheDocument();
    expect(screen.getByText("Unallocated: $0.00")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Share"));
    await user.type(screen.getByLabelText("Share"), "120");

    expect(screen.getByText("Allocated: $120.00")).toBeInTheDocument();
    expect(screen.getByText("Owner share: $0.00")).toBeInTheDocument();
    expect(screen.getByText("Unallocated: -$20.00")).toBeInTheDocument();
  });

  it("adds a manual participant and removes it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={draft()} />);

    await user.type(screen.getByLabelText("Manual participant"), "Pat");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("Pat")).toBeInTheDocument();
    expect(screen.getByLabelText("Manual participant")).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByText("Pat")).not.toBeInTheDocument();
  });

  it("splits the amount equally on request", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={draft({ participants: [row("a", ""), row("b", "")] })} />);

    await user.click(screen.getByRole("button", { name: "Split equally" }));

    expect(screen.getByTestId("values")).toHaveTextContent('["33.33","33.33"]');
  });

  it("asks for three characters before searching and adds a found app user", async () => {
    server.use(
      http.get(`${API_URL}/users/search`, () =>
        HttpResponse.json({ users: [{ id: "u9", username: "kim", displayName: "Kim" }] })
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={draft()} />);

    await user.type(screen.getByLabelText("Find app user"), "ki");
    expect(screen.getByText("Type at least 3 characters to search.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Find app user"), "m");
    await user.click(await screen.findByRole("button", { name: "Add app user" }));

    expect(screen.getByText("Kim (@kim)")).toBeInTheDocument();
  });

  it("limits search results to the selected group's members and hides manual entry", async () => {
    server.use(
      http.get(`${API_URL}/users/search`, () =>
        HttpResponse.json({
          users: [
            { id: "u2", username: "sam", displayName: "Sam" },
            { id: "u9", username: "kim", displayName: "Kim" }
          ]
        })
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={draft()} group={group} />);

    expect(screen.queryByLabelText("Manual participant")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Find app user"), "sam");
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Add app user" })).toHaveLength(1));
    expect(screen.queryByText("Kim")).not.toBeInTheDocument();
  });

  it("resets the split from the group's members", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={draft({ participants: [row("a", "1")] })} group={group} />);

    await user.click(screen.getByRole("button", { name: "Reset split" }));

    expect(screen.getByTestId("values")).toHaveTextContent('["50.00"]');
  });

  it("explains that a transfer cannot be shared", () => {
    renderWithProviders(<Harness initial={draft({ type: "transfer" })} />);
    expect(screen.getByText(/cannot be shared or split/)).toBeInTheDocument();
  });

  it("shows an existing transaction's sharing read-only", () => {
    renderWithProviders(
      <Harness
        initial={draft()}
        transaction={
          {
            sharedExpense: {
              title: "Dinner split",
              status: "open",
              participants: [{ id: "p1", participantName: "Sam", currency: "USD", shareAmount: 20, paidAmount: 5 }]
            }
          } as unknown as Transaction
        }
      />
    );
    expect(screen.getByText("Dinner split")).toBeInTheDocument();
    expect(screen.getByText("$20.00")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("says nothing is shared for an existing unshared transaction", () => {
    renderWithProviders(<Harness initial={draft()} transaction={{ sharedExpense: null } as Transaction} />);
    expect(screen.getByText("No shared expense is attached.")).toBeInTheDocument();
  });
});
