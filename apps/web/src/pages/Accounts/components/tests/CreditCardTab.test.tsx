import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { makeBilling, makePeriod } from "../../../../tests/fixtures/creditCardBilling";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Account } from "../../../../types/accounts.types";
import { CreditCardTab } from "../CreditCardTab";

const account = {
  id: "card-1",
  name: "Visa",
  type: "credit_card",
  currency: "MXN"
} as Account;

function Probe() {
  const location = useLocation();
  return (
    <div>
      <span data-testid="url">{location.pathname + location.search}</span>
      <span data-testid="from">{String((location.state as { from?: string } | null)?.from)}</span>
    </div>
  );
}

function mockBilling(billing = makeBilling()) {
  server.use(
    http.get("http://localhost:4000/accounts/card-1/credit-card", () => HttpResponse.json(billing))
  );
}

function renderTab() {
  return renderWithProviders(
    <Routes>
      <Route path="/accounts/card-1" element={<CreditCardTab account={account} />} />
      <Route path="*" element={<Probe />} />
    </Routes>,
    { route: "/accounts/card-1?tab=credit-card" }
  );
}

describe("CreditCardTab", () => {
  it("shows API figures, the estimate labeled Estimated and the periods table", async () => {
    mockBilling();
    renderTab();

    expect(await screen.findByText("Outstanding debt")).toBeInTheDocument();
    expect(screen.getByText("Utilization").parentElement).toHaveTextContent("30%");
    expect(screen.getByText("Amount to avoid interest").parentElement).toHaveTextContent("$4,000.00");
    expect(screen.getByText(/^Estimated .*123\.45/)).toBeInTheDocument();
    expect(screen.getByText("Assumes no further payments")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByText("Open")).toBeInTheDocument();
  });

  it("shows confirmed interest separately from the estimate", async () => {
    mockBilling(makeBilling({ periods: [makePeriod({ confirmedInterest: "150" })] }));
    renderTab();

    expect(await screen.findByText("Confirmed interest")).toBeInTheDocument();
    expect(screen.getByText("Confirmed interest").parentElement).toHaveTextContent("$150.00");
  });

  it("highlights an over-limit card", async () => {
    const base = makeBilling();
    mockBilling({
      ...base,
      metrics: { ...base.metrics, overLimit: true, availableCredit: "-500", utilizationPercent: "101" }
    });
    renderTab();

    expect(await screen.findByText("Over limit")).toBeInTheDocument();
    expect(screen.getByText("Credit limit").parentElement?.className).toContain("border-red-300");
  });

  it("shows No limit and no utilization for a card without a limit", async () => {
    const base = makeBilling();
    mockBilling({
      ...base,
      metrics: { ...base.metrics, creditLimit: null, availableCredit: null, utilizationPercent: null }
    });
    renderTab();

    expect(await screen.findByText("No limit")).toBeInTheDocument();
    expect(screen.getByText("Utilization").parentElement).toHaveTextContent("—");
  });

  it("prompts to configure an unconfigured card and hides the periods table", async () => {
    mockBilling(makeBilling({ configured: false, config: null, openPeriod: null, current: null, periods: [], totalPeriods: 0 }));
    renderTab();

    expect(await screen.findByText(/Set the statement closing day/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "General tab" })).toHaveAttribute("href", "/accounts/card-1?tab=general");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("labels older overdue periods as carried into later periods", async () => {
    mockBilling();
    renderTab();

    expect(await screen.findByText("Overdue (carried into later periods)")).toBeInTheDocument();
  });

  it("links a period to the Transactions tab filtered to its dates", async () => {
    mockBilling();
    const user = userEvent.setup();
    renderTab();

    const links = await screen.findAllByRole("link", { name: /2027/ });
    const target = links.find((link) => link.getAttribute("href")?.includes("periodFrom=2027-01-21"));
    expect(target).toHaveAttribute(
      "href",
      "/accounts/card-1?tab=transactions&periodFrom=2027-01-21&periodTo=2027-02-20&periodStartAt=2027-01-21T06%3A00%3A00.000Z&periodEndAt=2027-02-21T06%3A00%3A00.000Z"
    );
    await user.click(target!);
  });

  it("Pay opens a transfer draft for the current remaining and returns to the Credit card tab", async () => {
    mockBilling();
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("button", { name: "Pay" }));

    const url = new URL(screen.getByTestId("url").textContent!, "http://x");
    expect(url.pathname).toBe("/transactions/new");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      type: "transfer",
      amount: "4000",
      currency: "MXN",
      transferToAccountId: "card-1"
    });
    expect(screen.getByTestId("from")).toHaveTextContent("/accounts/card-1?tab=credit-card");
  });

  it("hides Pay when nothing remains", async () => {
    const base = makeBilling();
    mockBilling({ ...base, current: { ...base.current!, remaining: "0", status: "paid" } });
    renderTab();

    await screen.findByText("Outstanding debt");
    expect(screen.queryByRole("button", { name: "Pay" })).not.toBeInTheDocument();
  });

  it("opens the external payment and interest drafts", async () => {
    mockBilling();
    const user = userEvent.setup();
    const { unmount } = renderTab();
    await user.click(await screen.findByRole("button", { name: "Record external payment" }));
    expect(screen.getByTestId("url")).toHaveTextContent(
      "/transactions/new?type=income&accountId=card-1&creditCardKind=payment"
    );
    unmount();

    renderTab();
    await user.click(await screen.findByRole("button", { name: "Record interest charge" }));
    expect(screen.getByTestId("url")).toHaveTextContent(
      "/transactions/new?type=expense&accountId=card-1&creditCardKind=interest"
    );
  });

  it("requests the next page of periods from the pager", async () => {
    const pages: string[] = [];
    server.use(
      http.get("http://localhost:4000/accounts/card-1/credit-card", ({ request }) => {
        const page = new URL(request.url).searchParams.get("page") ?? "1";
        pages.push(page);
        return HttpResponse.json(makeBilling({ page: Number(page), totalPeriods: 20 }));
      })
    );
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("button", { name: /next/i }));
    await screen.findByText("Billing periods");
    expect(pages).toContain("2");
  });

  it("edits a period's end, then shows it Adjusted with the default after the reload", async () => {
    let adjusted = false;
    server.use(
      http.get("http://localhost:4000/accounts/card-1/credit-card", () =>
        HttpResponse.json(
          makeBilling({
            periods: [makePeriod(adjusted ? { end: "2027-02-23", endAdjusted: true, defaultEnd: "2027-02-20" } : {})]
          })
        )
      ),
      http.patch("http://localhost:4000/accounts/card-1/credit-card/periods/2027-02", () => {
        adjusted = true;
        return HttpResponse.json(makePeriod());
      })
    );
    renderTab();

    await userEvent.click(await screen.findByRole("button", { name: /Edit dates of period 2027-02/ }));
    const end = screen.getByLabelText("Period end");
    await userEvent.clear(end);
    await userEvent.type(end, "2027-02-23");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Adjusted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reset Period end to default/ })).toBeInTheDocument();
  });
});
