import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { server } from "../../../tests/mocks/server";
import type { SharedExpense } from "../../../types/sharedExpenses.types";
import { SharedExpensesPage } from "../SharedExpensesPage";

const API_URL = "http://localhost:4000";

function makeSharedExpense(overrides: Partial<SharedExpense> = {}): SharedExpense {
  return {
    id: "se-1",
    transactionId: "tx-1",
    ownerUserId: "user-1",
    title: "Dinner split",
    totalAmount: "100",
    status: "open",
    participants: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

function mockBaseline(sharedExpenses: SharedExpense[] = []) {
  server.use(
    http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    http.get(`${API_URL}/shared-expenses`, () => HttpResponse.json({ sharedExpenses })),
    http.get(`${API_URL}/transactions`, () => HttpResponse.json({ data: [], meta: {} }))
  );
}

describe("SharedExpensesPage", () => {
  it("renders the list with rows linking to the Shared Expense view and no inline form", async () => {
    mockBaseline([makeSharedExpense()]);
    renderWithProviders(<SharedExpensesPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Dinner split")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Dinner split/ })).toHaveAttribute(
      "href",
      "/debts/shared-expenses/se-1"
    );
    expect(screen.queryByText("New shared expense")).not.toBeInTheDocument();
  });

  it("scrolls the highlighted shared expense into view when sharedExpenseId is in the URL", async () => {
    mockBaseline([makeSharedExpense({ id: "se-highlighted" })]);
    renderWithProviders(<SharedExpensesPage />, {
      withAuth: true,
      route: "/shared-expenses?sharedExpenseId=se-highlighted"
    });

    await waitFor(() =>
      expect(document.getElementById("shared-expense-se-highlighted")).toBeInTheDocument()
    );
  });
});
