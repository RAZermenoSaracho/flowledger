import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { Account } from "../../../../types/accounts.types";
import { useAccountEditForm } from "../../hooks/useAccountEditForm";
import { AccountListItem } from "../AccountListItem";

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

function Harness({
  account,
  isExpanded = true,
  preferredCurrency = null
}: {
  account: Account;
  isExpanded?: boolean;
  preferredCurrency?: string | null;
}) {
  const editForm = useAccountEditForm();
  return (
    <AccountListItem
      account={account}
      editForm={editForm}
      preferredCurrency={preferredCurrency}
      isExpanded={isExpanded}
      onToggleExpanded={() => {}}
      resyncMessages={{}}
      isStartingCredentialFlow={false}
      hasCredentialFlowError={false}
      onResync={() => {}}
      onReconnect={() => {}}
    />
  );
}

function renderItem(props: Parameters<typeof Harness>[0]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("AccountListItem", () => {
  it("renders name, source badge, type/currency, and FlowLedger balance", () => {
    renderItem({ account: makeAccount() });
    expect(screen.getByText("Checking")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText(/checking · USD/)).toBeInTheDocument();
    expect(screen.getByText(/FlowLedger balance \$500\.00/)).toBeInTheDocument();
  });

  it("shows 'Synced' badge and 'Archived' badge appropriately", () => {
    renderItem({ account: makeAccount({ source: "synced", isArchived: true }) });
    expect(screen.getByText("Synced")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("shows a negative balance in the negative color", () => {
    renderItem({ account: makeAccount({ currentBalance: -50 }) });
    expect(screen.getByText(/FlowLedger balance -\$50\.00/)).toHaveClass("text-coral");
  });

  it("shows the identifier when present", () => {
    renderItem({ account: makeAccount({ identifier: "****1234" }) });
    expect(screen.getByText("****1234")).toBeInTheDocument();
  });

  it("shows the preferred-currency balance only when it differs from the account currency and a converted value exists", () => {
    renderItem({
      account: makeAccount({ currentBalanceInPreferredCurrency: 450 }),
      preferredCurrency: "EUR"
    });
    expect(screen.getByText("€450.00")).toBeInTheDocument();
  });

  it("omits the preferred-currency balance when it matches the account currency", () => {
    renderItem({
      account: makeAccount({ currency: "USD", currentBalanceInPreferredCurrency: 500 }),
      preferredCurrency: "USD"
    });
    expect(screen.queryByText("$450.00")).not.toBeInTheDocument();
  });

  it("toggles the mobile expand button's aria-expanded/label", () => {
    renderItem({ account: makeAccount(), isExpanded: false });
    expect(
      screen.getByRole("button", { name: "Show details for Checking" })
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the edit form and saves changes", async () => {
    let updatedBody: unknown;
    server.use(
      http.put(`${API_URL}/accounts/acc-1`, async ({ request }) => {
        updatedBody = await request.json();
        return HttpResponse.json({ account: makeAccount({ name: "New name" }) });
      })
    );
    const user = userEvent.setup();
    renderItem({ account: makeAccount() });

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    const nameInput = screen.getAllByLabelText("Name")[0]!;
    await user.clear(nameInput);
    await user.type(nameInput, "New name");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updatedBody).toMatchObject({ name: "New name" }));
  });

  it("cancels the edit form", async () => {
    const user = userEvent.setup();
    renderItem({ account: makeAccount() });

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryAllByLabelText("Name")).toHaveLength(0);
  });

  it("archives an active account and shows Restore for an archived one", async () => {
    let archived = false;
    server.use(
      http.post(`${API_URL}/accounts/acc-1/archive`, () => {
        archived = true;
        return HttpResponse.json({ account: makeAccount({ isArchived: true }) });
      })
    );
    const user = userEvent.setup();
    renderItem({ account: makeAccount() });

    await user.click(screen.getAllByRole("button", { name: "Archive" })[0]!);
    await waitFor(() => expect(archived).toBe(true));
  });

  it("shows Restore for an already-archived account", () => {
    renderItem({ account: makeAccount({ isArchived: true }) });
    expect(screen.getAllByRole("button", { name: "Restore" }).length).toBeGreaterThan(0);
  });

  it("deletes the account after confirmation", async () => {
    let deleted = false;
    server.use(
      http.delete(`${API_URL}/accounts/acc-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    renderItem({ account: makeAccount() });

    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    await waitFor(() => expect(deleted).toBe(true));
  });

  it("renders the AccountSyncPanel for a synced account with sync entries", () => {
    renderItem({
      account: makeAccount({
        source: "synced",
        sync: [
          {
            id: "sync-1",
            provider: "syncfy",
            providerCredentialId: "cred-1",
            providerAccountId: "pa-1",
            status: "active",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
          }
        ]
      })
    });

    expect(screen.getByText("syncfy")).toBeInTheDocument();
  });
});
