import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { makePeriod } from "../../../../tests/fixtures/creditCardBilling";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { BillingPeriodDateCell } from "../BillingPeriodDateCell";

const url = "http://localhost:4000/accounts/card-1/credit-card/periods/2027-02";

describe("BillingPeriodDateCell", () => {
  it("shows a default date plainly, without a marker or reset", () => {
    renderWithProviders(<BillingPeriodDateCell accountId="card-1" period={makePeriod()} field="end" />);
    expect(screen.queryByText("Adjusted")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("marks an adjusted date with its default and resets it with null", async () => {
    let body: unknown;
    server.use(
      http.patch(url, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makePeriod());
      })
    );
    const period = makePeriod({ end: "2027-02-23", endAdjusted: true, defaultEnd: "2027-02-20" });
    renderWithProviders(<BillingPeriodDateCell accountId="card-1" period={period} field="end" />);

    expect(screen.getByText("Adjusted")).toBeInTheDocument();
    expect(screen.getByText(/^Default /)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Reset Period end to default/ }));

    await screen.findByRole("button", { name: /Reset Period end/ });
    expect(body).toEqual({ closingDate: null });
  });

  it("resets the due date with dueDate null and shows an API error", async () => {
    let body: unknown;
    server.use(
      http.patch(url, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ message: "Cannot reset" }, { status: 400 });
      })
    );
    const period = makePeriod({ dueDate: "2027-03-25", dueAdjusted: true, defaultDue: "2027-03-20" });
    renderWithProviders(<BillingPeriodDateCell accountId="card-1" period={period} field="due" />);

    await userEvent.click(screen.getByRole("button", { name: /Reset Payment due to default/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reset");
    expect(body).toEqual({ dueDate: null });
  });
});
