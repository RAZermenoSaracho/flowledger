import { screen, waitFor } from "@testing-library/react";
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
    shareAmount: 100,
    paidAmount: 40,
    status: "partial",
    sharedExpenseId: "se-1",
    debtorUserId: "user-2",
    creditorUserId: "user-1",
    outstandingAmount: 60,
    pendingSettlementAmount: 0,
    sharedExpense: {
      id: "se-1",
      transactionId: "tx-1",
      ownerUserId: "user-1",
      title: "Dinner split",
      totalAmount: 100,
      status: "open",
      owner: { id: "user-1", name: "Jane", email: "jane@example.com" },
      user: { id: "user-2", name: "Sam", email: "sam@example.com" },
      participants: [],
      createdAt: "",
      updatedAt: ""
    } as Debt["sharedExpense"],
    user: { id: "user-2", name: "Sam", email: "sam@example.com" },
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
        person: { id: "user-2", name: "Sam", email: "sam@example.com" },
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
    expect(screen.getByText("Back to balances").closest("a")).toHaveAttribute(
      "href",
      "/debts?tab=balances"
    );
  });
});
