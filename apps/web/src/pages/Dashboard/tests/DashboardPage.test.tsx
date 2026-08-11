import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { server } from "../../../tests/mocks/server";
import { DashboardPage } from "../DashboardPage";

const API_URL = "http://localhost:4000";

function mockBaseline() {
  server.use(
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
    http.get(`${API_URL}/reports/monthly-cashflow`, () =>
      HttpResponse.json({
        cashflow: [{ month: "2024-01", income: 1000, expenses: 400 }],
        currency: "USD"
      })
    ),
    http.get(`${API_URL}/transactions`, () =>
      HttpResponse.json({
        data: [
          { id: "t1", name: "Paycheck", amount: 1000, type: "income" },
          { id: "t2", name: "Groceries", amount: 42.5, type: "expense" }
        ],
        meta: {}
      })
    )
  );
}

describe("DashboardPage", () => {
  it("renders zeroed metrics before the summary query resolves", () => {
    mockBaseline();
    renderWithProviders(<DashboardPage />);

    expect(screen.getByText("Total income")).toBeInTheDocument();
    expect(screen.getAllByText("$0.00").length).toBeGreaterThan(0);
  });

  it("renders summary metrics once loaded", async () => {
    mockBaseline();
    renderWithProviders(<DashboardPage />);

    await waitFor(() => expect(screen.getByText("Total income").parentElement).toHaveTextContent("$1,000.00"));
    expect(screen.getByText("$600.00")).toBeInTheDocument();
  });

  it("renders recent transactions with income/expense styling", async () => {
    mockBaseline();
    renderWithProviders(<DashboardPage />);

    await waitFor(() => expect(screen.getByText("Paycheck")).toBeInTheDocument());
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("$42.50")).toHaveClass("text-coral");
  });

  it("renders an empty recent-activity list gracefully", async () => {
    server.use(
      http.get(`${API_URL}/reports/summary`, () =>
        HttpResponse.json({
          summary: {
            totalIncome: 0,
            totalGrossIncome: 0,
            totalNetIncome: 0,
            totalExpenses: 0,
            totalGrossExpenses: 0,
            totalExpenseReimbursements: 0,
            totalNetExpenses: 0,
            currentBalance: 0,
            reportIncome: 0,
            reportExpenses: 0,
            reportBalance: 0
          },
          currency: "USD"
        })
      ),
      http.get(`${API_URL}/reports/monthly-cashflow`, () =>
        HttpResponse.json({ cashflow: [], currency: "USD" })
      ),
      http.get(`${API_URL}/transactions`, () => HttpResponse.json({ data: [], meta: {} }))
    );

    renderWithProviders(<DashboardPage />);

    await waitFor(() => expect(screen.getByText("Recent activity")).toBeInTheDocument());
    expect(screen.queryByText("Paycheck")).not.toBeInTheDocument();
  });
});
