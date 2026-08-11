import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { server } from "../../../tests/mocks/server";
import { ReportsPage } from "../ReportsPage";

const API_URL = "http://localhost:4000";

function mockBaseline() {
  server.use(
    http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    http.get(`${API_URL}/categories`, () => HttpResponse.json({ categories: [] })),
    http.get(`${API_URL}/groups`, () =>
      HttpResponse.json({
        groups: [
          {
            id: "group-1",
            name: "Roommates",
            ownerUserId: "user-1",
            isArchived: false,
            members: [],
            categories: [{ id: "cat-1", name: "Groceries" }],
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
          }
        ]
      })
    ),
    http.get(`${API_URL}/reports/summary`, () =>
      HttpResponse.json({
        summary: {
          totalIncome: 1000,
          totalGrossIncome: 1000,
          totalNetIncome: 1000,
          totalExpenses: 400,
          totalGrossExpenses: 400,
          totalExpenseReimbursements: 0,
          totalNetExpenses: 400,
          currentBalance: 600,
          reportIncome: 1000,
          reportExpenses: 400,
          reportBalance: 600
        },
        currency: "USD"
      })
    ),
    http.get(`${API_URL}/reports/by-category`, () =>
      HttpResponse.json({ expenseCategories: [], incomeCategories: [], currency: "USD" })
    ),
    http.get(`${API_URL}/reports/monthly-cashflow`, () =>
      HttpResponse.json({ cashflow: [], currency: "USD" })
    ),
    http.get(`${API_URL}/currencies`, () =>
      HttpResponse.json({
        currencies: [{ code: "USD", name: "US Dollar" }],
        fiat: [{ code: "USD", name: "US Dollar" }],
        crypto: []
      })
    )
  );
}

describe("ReportsPage", () => {
  it("renders the filters card, summary cards, category breakdowns, and cashflow chart", async () => {
    mockBaseline();
    renderWithProviders(<ReportsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("$1,000.00")).toBeInTheDocument());
    expect(screen.getByText("Expenses by category")).toBeInTheDocument();
    expect(screen.getByText("Income by category")).toBeInTheDocument();
    expect(screen.getByText("Monthly cashflow")).toBeInTheDocument();
  });

  it("narrows category options to the selected group's categories once a group is picked", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderWithProviders(<ReportsPage />, { withAuth: true });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Groups All groups" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Groups All groups" }));
    await user.click(screen.getByRole("checkbox", { name: "Roommates" }));

    await user.click(screen.getByRole("button", { name: "Categories All categories" }));
    expect(screen.getByRole("checkbox", { name: "Groceries" })).toBeInTheDocument();
  });

  it("shows 'Reset filters' once a filter is active", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderWithProviders(<ReportsPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByLabelText("From")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Reset filters" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("From"), "2024-01-01");

    expect(screen.getByRole("button", { name: "Reset filters" })).toBeInTheDocument();
  });
});
