import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { server } from "../../../tests/mocks/server";
import type { Debt, DebtsResponse } from "../../../types/debts.types";
import { PersonDebtDetailPage } from "../PersonDebtDetailPage";

const API_URL = "http://localhost:4000";

const authedUser = {
  id: "user-1",
  name: "Jane",
  email: "jane@example.com",
  planType: "free" as const,
  mobileSidebarSide: "left" as const,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
};

function makeDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "debt-1",
    userId: "user-2",
    participantName: "Friend",
    currency: "USD",
    shareAmount: "100",
    paidAmount: "40",
    status: "partial",
    sharedExpenseId: "se-1",
    debtorUserId: "user-2",
    creditorUserId: "user-1",
    outstandingAmount: "60",
    pendingSettlementAmount: "0",
    sharedExpense: {
      id: "se-1",
      transactionId: "tx-1",
      ownerUserId: "user-1",
      title: "Dinner split",
      totalAmount: "100",
      status: "open",
      owner: { id: "user-1", username: "jane", nickname: null, displayName: "Jane" },
      user: { id: "user-2", username: "sam", nickname: null, displayName: "Sam" },
      participants: [],
      createdAt: "",
      updatedAt: ""
    } as Debt["sharedExpense"],
    user: { id: "user-2", username: "sam", nickname: null, displayName: "Sam" },
    settlementRequests: [],
    ...overrides
  };
}

function makeDebtsResponse(overrides: Partial<DebtsResponse> = {}): DebtsResponse {
  return {
    iOwe: [],
    owedToMe: [makeDebt()],
    balances: [
      {
        key: "user-2",
        person: { id: "user-2", username: "sam", nickname: null, displayName: "Sam" },
        fallbackName: "Sam",
        theyOweMe: [makeDebt()],
        iOweThem: [],
        theyOweMeTotal: 60,
        iOweThemTotal: 0,
        netBalance: 60
      }
    ],
    pendingSettlementRequests: [],
    approvedSettlementRequests: [],
    settledDebts: [],
    ...overrides
  };
}

function mockBaseline(debts: DebtsResponse = makeDebtsResponse()) {
  server.use(
    http.post(`${API_URL}/auth/refresh`, () =>
      HttpResponse.json({ token: "tok", user: authedUser })
    ),
    http.get(`${API_URL}/debts`, () => HttpResponse.json(debts)),
    http.get(`${API_URL}/accounts`, () => HttpResponse.json({ accounts: [] })),
    http.get(`${API_URL}/categories`, () => HttpResponse.json({ categories: [] })),
    http.get(`${API_URL}/groups`, () => HttpResponse.json({ groups: [] }))
  );
}

function renderPage(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/debts/balances/:personKey" element={<PersonDebtDetailPage />} />
    </Routes>,
    { withAuth: true, route }
  );
}

describe("PersonDebtDetailPage", () => {
  it("shows a loading indicator, then the matched person's detail once loaded", async () => {
    mockBaseline();
    renderPage("/debts/balances/user-2");

    expect(screen.getByText("Loading balance...")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Net balance $60.00")).toBeInTheDocument());
  });

  it("shows a not-found message when no balance matches the person key", async () => {
    mockBaseline();
    renderPage("/debts/balances/no-such-person");

    await waitFor(() =>
      expect(
        screen.getByText("This balance is no longer outstanding, or could not be found.")
      ).toBeInTheDocument()
    );
  });

  it("shows an error message when the debts query fails", async () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, () =>
        HttpResponse.json({ token: "tok", user: authedUser })
      ),
      http.get(`${API_URL}/debts`, () => new HttpResponse(null, { status: 500 })),
      http.get(`${API_URL}/accounts`, () => HttpResponse.json({ accounts: [] })),
      http.get(`${API_URL}/categories`, () => HttpResponse.json({ categories: [] })),
      http.get(`${API_URL}/groups`, () => HttpResponse.json({ groups: [] }))
    );
    renderPage("/debts/balances/user-2");

    await waitFor(() =>
      expect(screen.getByText("Could not load this balance.")).toBeInTheDocument()
    );
  });

  it("links back to the balances tab", async () => {
    mockBaseline();
    renderPage("/debts/balances/user-2");

    await waitFor(() => expect(screen.getByText("Net balance $60.00")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Sam (@sam)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to balances" })).toHaveAttribute(
      "href",
      "/debts?tab=balances"
    );
  });

  it("renders the back link, title and both debt tables inside a single card", async () => {
    mockBaseline();
    const { container } = renderPage("/debts/balances/user-2");

    await waitFor(() => expect(screen.getByText("Net balance $60.00")).toBeInTheDocument());
    const card = screen.getByRole("link", { name: "Back to balances" }).closest(".rounded-lg");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByRole("heading", { name: "Sam (@sam)" })).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("They owe me")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("I owe them")).toBeInTheDocument();
    expect(container.querySelectorAll(".rounded-lg.border.bg-white")).toHaveLength(1);
  });

  it("keeps the back arrow while loading and when the balance is not found", async () => {
    mockBaseline();
    renderPage("/debts/balances/no-such-person");

    expect(screen.getByRole("link", { name: "Back to balances" })).toBeInTheDocument();
    await screen.findByText("This balance is no longer outstanding, or could not be found.");
    expect(screen.getByRole("link", { name: "Back to balances" })).toHaveAttribute(
      "href",
      "/debts?tab=balances"
    );
  });

  describe("settling what I owe", () => {
    const owed = makeDebt({
      id: "debt-9",
      debtorUserId: "user-1",
      creditorUserId: "user-2",
      userId: "user-1"
    });
    const response = makeDebtsResponse({
      owedToMe: [],
      iOwe: [owed],
      balances: [
        {
          key: "user-2",
          person: { id: "user-2", username: "sam", nickname: null, displayName: "Sam" },
          fallbackName: "Sam",
          theyOweMe: [],
          iOweThem: [owed],
          theyOweMeTotal: 0,
          iOweThemTotal: 60,
          netBalance: -60
        }
      ]
    });

    function mockSettlementData() {
      mockBaseline(response);
      server.use(
        http.get(`${API_URL}/accounts`, () =>
          HttpResponse.json({
            accounts: [{ id: "acc-1", name: "Checking", currency: "USD", type: "checking", balance: 0 }]
          })
        ),
        http.get(`${API_URL}/categories`, () =>
          HttpResponse.json({
            categories: [{ id: "cat-1", name: "Food", type: "expense", groupId: null }]
          })
        )
      );
    }

    it("submits a single settlement request", async () => {
      mockSettlementData();
      const bodies: unknown[] = [];
      server.use(
        http.post(`${API_URL}/debts/debt-9/settlement-request`, async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json({ settlementRequest: {} });
        })
      );
      renderPage("/debts/balances/user-2");

      await waitFor(() => expect(screen.getByLabelText("Account")).toHaveValue("acc-1"));
      await waitFor(() => expect(screen.getByLabelText("Category")).toHaveValue("cat-1"));
      await userEvent.click(screen.getByRole("button", { name: "Request settlement" }));

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toMatchObject({ amount: "60.00", accountId: "acc-1", categoryId: "cat-1" });
    });

    it("submits the selected debts as a batch", async () => {
      mockSettlementData();
      const bodies: unknown[] = [];
      server.use(
        http.post(`${API_URL}/debts/settlement-requests/batch`, async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json({ settlementRequests: [] });
        })
      );
      renderPage("/debts/balances/user-2");

      await waitFor(() => expect(screen.getByLabelText("Category")).toHaveValue("cat-1"));
      await userEvent.click(screen.getByRole("checkbox", { name: /^Select / }));
      await userEvent.click(screen.getByRole("button", { name: "Request Selected" }));

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toMatchObject({ requests: [{ debtId: "debt-9", accountId: "acc-1", categoryId: "cat-1" }] });
    });
  });
});
