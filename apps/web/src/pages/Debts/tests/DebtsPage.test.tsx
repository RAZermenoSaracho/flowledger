import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { server } from "../../../tests/mocks/server";
import type { Debt, DebtsResponse, SettlementRequest } from "../../../types/debts.types";
import { DebtsPage } from "../DebtsPage";

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
    http.get(`${API_URL}/groups`, () => HttpResponse.json({ groups: [] })),
    http.get(`${API_URL}/shared-expenses`, () => HttpResponse.json({ sharedExpenses: [] })),
    http.get(`${API_URL}/transactions`, () => HttpResponse.json({ data: [], meta: {} }))
  );
}

describe("DebtsPage", () => {
  it("defaults to the Outstanding Balances tab", async () => {
    mockBaseline();
    renderWithProviders(<DebtsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Sam")).toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Outstanding Balances" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("shows a loading indicator, then debts once loaded", async () => {
    mockBaseline();
    renderWithProviders(<DebtsPage />, { withAuth: true });

    expect(screen.getByText("Loading debts...")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Loading debts...")).not.toBeInTheDocument());
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
    renderWithProviders(<DebtsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Could not load debts.")).toBeInTheDocument());
  });

  it("switches to the Pending Settlement Requests tab", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderWithProviders(<DebtsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Sam")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Pending Settlement Requests" }));

    expect(screen.getByText("Pending settlement requests")).toBeInTheDocument();
  });

  it("switches to the Settled History tab", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderWithProviders(<DebtsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Sam")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Settled History" }));

    expect(screen.getByText("Settled history")).toBeInTheDocument();
  });

  it("switches to the Shared Expenses tab, embedding SharedExpensesPage", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderWithProviders(<DebtsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Sam")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Shared Expenses" }));

    expect(screen.getByRole("heading", { name: "Shared expenses" })).toBeInTheDocument();
  });

  it("auto-selects the Pending tab when ?settlementId= is present", async () => {
    const request: SettlementRequest = {
      id: "sr-1",
      sharedExpenseParticipantId: "debt-1",
      debtorUserId: "user-2",
      creditorUserId: "user-1",
      amount: 50,
      status: "pending",
      sharedExpenseParticipant: makeDebt(),
      createdAt: "",
      updatedAt: ""
    };
    mockBaseline(makeDebtsResponse({ pendingSettlementRequests: [request] }));
    renderWithProviders(<DebtsPage />, {
      withAuth: true,
      route: "/debts?settlementId=sr-1"
    });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Pending Settlement Requests" })).toHaveAttribute(
        "aria-selected",
        "true"
      )
    );
  });

  it("redirects to the counterparty's detail page when ?debtId= matches an open debt", async () => {
    mockBaseline();
    renderWithProviders(
      <Routes>
        <Route path="/debts" element={<DebtsPage />} />
        <Route
          path="/debts/balances/:personKey"
          element={<p>Redirected to person detail</p>}
        />
      </Routes>,
      { withAuth: true, route: "/debts?debtId=debt-1" }
    );

    await waitFor(() =>
      expect(screen.getByText("Redirected to person detail")).toBeInTheDocument()
    );
  });

  it("auto-selects the Settled tab when ?debtId= matches a settled debt", async () => {
    const settled = makeDebt({ id: "debt-settled", outstandingAmount: 0 });
    mockBaseline(makeDebtsResponse({ settledDebts: [settled] }));
    renderWithProviders(<DebtsPage />, {
      withAuth: true,
      route: "/debts?debtId=debt-settled"
    });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Settled History" })).toHaveAttribute(
        "aria-selected",
        "true"
      )
    );
  });
});
