import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { server } from "../../../tests/mocks/server";
import { ReportsPage } from "../ReportsPage";

const API_URL = "http://localhost:4000";

function mockBaseline() {
  server.use(
    http.post(
      `${API_URL}/auth/refresh`,
      () => new HttpResponse(null, { status: 401 })
    ),
    http.get(`${API_URL}/categories`, () =>
      HttpResponse.json({ categories: [] })
    ),
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
      HttpResponse.json({
        expenseCategories: [],
        incomeCategories: [],
        currency: "USD"
      })
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

    await waitFor(() =>
      expect(screen.getByText("$1,000.00")).toBeInTheDocument()
    );
    expect(screen.getByText("Expenses by category")).toBeInTheDocument();
    expect(screen.getByText("Income by category")).toBeInTheDocument();
    expect(screen.getByText("Monthly cashflow")).toBeInTheDocument();
  });

  it("narrows category options to the selected group's categories once a group is picked", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderWithProviders(<ReportsPage />, { withAuth: true });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Groups All groups" })
      ).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Groups All groups" }));
    await user.click(screen.getByRole("checkbox", { name: "Roommates" }));

    await user.click(
      screen.getByRole("button", { name: "Categories All categories" })
    );
    expect(
      screen.getByRole("checkbox", { name: "Groceries" })
    ).toBeInTheDocument();
  });

  it("shows 'Reset filters' once a filter is active", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderWithProviders(<ReportsPage />, { withAuth: true });

    await waitFor(() =>
      expect(screen.getByLabelText("From")).toBeInTheDocument()
    );
    expect(
      screen.queryByRole("button", { name: "Reset filters" })
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("From"), "2024-01-01");

    expect(
      screen.getByRole("button", { name: "Reset filters" })
    ).toBeInTheDocument();
  });

  describe("local-day date filters", () => {
    const originalTz = process.env.TZ;

    afterEach(() => {
      process.env.TZ = originalTz;
    });

    it("sends the start of the first local day and the start of the day after the last", async () => {
      process.env.TZ = "America/Mexico_City";
      mockBaseline();
      const queries: URLSearchParams[] = [];
      server.use(
        http.get(`${API_URL}/reports/summary`, ({ request }) => {
          queries.push(new URL(request.url).searchParams);
          return HttpResponse.json({
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
          });
        })
      );
      const user = userEvent.setup();
      renderWithProviders(<ReportsPage />, { withAuth: true });

      await waitFor(() => expect(screen.getByLabelText("From")).toBeInTheDocument());
      await user.type(screen.getByLabelText("From"), "2026-11-05");
      await user.type(screen.getByLabelText("To"), "2026-11-05");

      await waitFor(() => {
        const last = queries.at(-1);
        expect(last?.get("dateFrom")).toBe("2026-11-05T06:00:00.000Z");
        expect(last?.get("dateTo")).toBe("2026-11-06T06:00:00.000Z");
      });
    });

    it("sends dateTo as the exclusive minute after a timed upper bound", async () => {
      process.env.TZ = "America/Mexico_City";
      mockBaseline();
      const queries: URLSearchParams[] = [];
      server.use(
        http.get(`${API_URL}/reports/monthly-cashflow`, ({ request }) => {
          queries.push(new URL(request.url).searchParams);
          return HttpResponse.json({ cashflow: [], currency: "USD" });
        })
      );
      renderWithProviders(<ReportsPage />, { withAuth: true });

      await waitFor(() => expect(screen.getByLabelText("To")).toBeInTheDocument());
      fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-05" } });
      fireEvent.change(screen.getByLabelText("To time"), { target: { value: "14:30" } });

      await waitFor(() =>
        expect(queries.at(-1)?.get("dateTo")).toBe("2026-11-05T20:31:00.000Z")
      );
    });

    it("sends the device timeZone with the monthly cashflow request", async () => {
      process.env.TZ = "America/Mexico_City";
      mockBaseline();
      let timeZone: string | null = null;
      server.use(
        http.get(`${API_URL}/reports/monthly-cashflow`, ({ request }) => {
          timeZone = new URL(request.url).searchParams.get("timeZone");
          return HttpResponse.json({ cashflow: [], currency: "USD" });
        })
      );
      renderWithProviders(<ReportsPage />, { withAuth: true });

      await waitFor(() => expect(timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone));
      expect(timeZone).toBe("America/Mexico_City");
    });
  });
});
