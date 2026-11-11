import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { API_URL } from "../../tests/profileFixtures";
import { FinancialOverviewSection } from "../FinancialOverviewSection";

const netWorth = {
  status: "ok",
  total: 1150,
  accounts: 1000,
  owedToMe: 200,
  iOwe: 50,
  partial: false,
  excluded: [],
  awaitingAcceptance: 0
};

function respond(body: unknown, status = 200) {
  server.use(http.get(`${API_URL}/reports/financial-overview`, () => HttpResponse.json(body as never, { status })));
}

describe("FinancialOverviewSection", () => {
  it("shows loading, then both metrics without disclosures", async () => {
    respond({
      currency: "USD",
      netWorth,
      savingsRate: { status: "ok", month: "2026-10", rate: 25, netIncome: 1000, netExpenses: 750 },
      disclosures: []
    });
    renderWithProviders(<FinancialOverviewSection />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(await screen.findByText("$1,150.00")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText(/October 2026/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText(/awaiting acceptance/)).not.toBeInTheDocument();
  });

  it("shows partial net worth, awaiting acceptance and disclosures", async () => {
    respond({
      currency: "USD",
      netWorth: { ...netWorth, partial: true, excluded: ["Euro acct"], awaitingAcceptance: 2 },
      savingsRate: { status: "no_data", month: "2026-10" },
      disclosures: ["synced_balances"]
    });
    renderWithProviders(<FinancialOverviewSection />);
    expect(await screen.findByText(/Euro acct/)).toBeInTheDocument();
    expect(screen.getByText("2 awaiting acceptance (not counted)")).toBeInTheDocument();
    expect(screen.getByText("Not enough data")).toBeInTheDocument();
    expect(screen.getByText(/may differ from the bank/)).toBeInTheDocument();
  });

  it("shows an unavailable savings rate and an errored net worth independently", async () => {
    respond({
      currency: "USD",
      netWorth: { status: "error" },
      savingsRate: { status: "unavailable_income", month: "2026-10" },
      disclosures: []
    });
    renderWithProviders(<FinancialOverviewSection />);
    expect(await screen.findByText("Net worth could not be calculated.")).toBeInTheDocument();
    expect(screen.getByText(/Unavailable: no net income/)).toBeInTheDocument();
  });

  it("shows a section error when the request fails", async () => {
    respond({ message: "boom" }, 500);
    renderWithProviders(<FinancialOverviewSection />);
    expect(await screen.findByText("Financial overview could not be loaded.")).toBeInTheDocument();
  });
});
