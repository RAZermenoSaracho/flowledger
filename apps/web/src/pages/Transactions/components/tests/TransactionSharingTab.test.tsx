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

  it("keeps the BTC owner share exact", () => {
    renderWithProviders(
      <Harness
        initial={draft({
          amount: "1.234567890123456789",
          executionCurrency: "BTC",
          participants: [row("a", "0.62")]
        })}
      />
    );

    expect(screen.getByText("Owner share: 0.614567890123456789 BTC")).toBeInTheDocument();
    expect(screen.getByText("Allocated: 0.62 BTC")).toBeInTheDocument();
    expect(screen.getByText("Unallocated: 0 BTC")).toBeInTheDocument();
  });

  it("shows exact over-allocation for ETH", () => {
    renderWithProviders(
      <Harness
        initial={draft({ amount: "1", executionCurrency: "ETH", participants: [row("a", "1.000000000000000001")] })}
      />
    );

    expect(screen.getByText("Owner share: 0 ETH")).toBeInTheDocument();
    expect(screen.getByText("Unallocated: -0.000000000000000001 ETH")).toBeInTheDocument();
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

  it("offers any found app user and manual entry on a Group transaction, not only members", async () => {
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

    expect(screen.getByLabelText("Manual participant")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Find app user"), "sam");
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Add app user" })).toHaveLength(2));
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

  const stored = (participants: TransactionDraft["participants"], overrides: Partial<TransactionDraft> = {}) => ({
    initial: draft({ participants, ...overrides }),
    transaction: {
      sharedExpense: {
        id: "se1",
        title: "Dinner",
        participants: participants.map((p) => ({ id: p.id, shareAmount: Number(p.shareAmount) }))
      }
    } as unknown as Transaction
  });
  const stub = (id: string, extra: Partial<TransactionDraft["participants"][number]> = {}) => ({
    draftId: id,
    id,
    userId: `user-${id}`,
    participantName: `@${id}`,
    source: "app" as const,
    shareAmount: "20",
    paidAmount: "0",
    status: "pending" as const,
    acceptance: "proposed" as const,
    ...extra
  });

  it("shows paid and response columns for a stored transaction and lets the owner edit a share", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness {...stored([stub("sam", { paidAmount: "5", acceptance: "accepted" }), stub("kim")])} />);

    expect(screen.getByText("$5.00")).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("Proposed")).toBeInTheDocument();
    const shares = screen.getAllByLabelText("Share");
    await user.clear(shares[1]!);
    await user.type(shares[1]!, "30");
    expect(screen.getByTestId("values")).toHaveTextContent('["20","30"]');
  });

  it("locks a fully paid share and its removal, and the unshare toggle while a payment exists", () => {
    renderWithProviders(
      <Harness {...stored([stub("sam", { paidAmount: "20", status: "paid", acceptance: "accepted" }), stub("kim")])} />
    );

    expect(screen.getAllByLabelText("Share")[0]).toBeDisabled();
    expect(screen.getAllByLabelText("Share")[1]).toBeEnabled();
    expect(screen.getByText("Settled")).toBeInTheDocument();
    expect(screen.getByText(/Fully settled/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);
    const toggle = screen.getByRole("checkbox", { name: "Shared transaction" });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAccessibleDescription(/cannot be turned off/);
  });

  it("lists two lines of one user separately and offers Add allocation on a paid line", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Harness
        {...stored([
          stub("a", { userId: "u9", participantName: "@sam", paidAmount: "20", status: "paid", acceptance: "accepted" })
        ])}
      />
    );

    await user.click(screen.getByRole("button", { name: "Add allocation" }));

    expect(screen.getAllByText("@sam")).toHaveLength(2);
    expect(screen.getByText("Additional allocation")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Share")[0]).toBeDisabled();
    expect(screen.getAllByLabelText("Share")[1]).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Add allocation" })).not.toBeInTheDocument();
  });

  it("does not offer Add allocation for a user with no payment", () => {
    renderWithProviders(<Harness {...stored([stub("sam")])} />);
    expect(screen.queryByRole("button", { name: "Add allocation" })).not.toBeInTheDocument();
  });

  it("blocks adding an unpaid existing user from search and explains why", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${API_URL}/users/search`, () =>
        HttpResponse.json({ users: [{ id: "user-sam", username: "sam", displayName: "Sam" }] })
      )
    );
    renderWithProviders(<Harness {...stored([stub("sam")])} />);

    await user.type(screen.getByLabelText("Find app user"), "sam");
    await user.click(await screen.findByRole("button", { name: "Add app user" }));

    expect(await screen.findByText(/already a participant/)).toBeInTheDocument();
    expect(screen.getAllByLabelText("Share")).toHaveLength(1);
  });

  it("allows turning sharing off when nobody has paid", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness {...stored([stub("sam")])} />);

    await user.click(screen.getByRole("checkbox", { name: "Shared transaction" }));

    expect(screen.queryByText("@sam")).not.toBeInTheDocument();
  });

  it("marks a newly added app user as invited on save and a manual one as accepted", () => {
    renderWithProviders(
      <Harness
        {...stored([
          { draftId: "n", userId: "u7", participantName: "@new", source: "app", shareAmount: "5" },
          { draftId: "m", participantName: "Pat", source: "manual", shareAmount: "5" }
        ])}
      />
    );

    expect(screen.getByText("Invited on save")).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  it("can enable sharing on a stored, unshared transaction", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Harness initial={draft({ isShared: false })} transaction={{ sharedExpense: null } as Transaction} />
    );

    await user.click(screen.getByRole("checkbox", { name: "Shared transaction" }));

    expect(screen.getByLabelText("Shared transaction title")).toBeInTheDocument();
  });
});
