import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { makePeriod } from "../../../../tests/fixtures/creditCardBilling";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { BillingPeriodDatesEditor } from "../BillingPeriodDatesEditor";

const url = "http://localhost:4000/accounts/card-1/credit-card/periods/2027-02";
const period = makePeriod();

function renderEditor() {
  return renderWithProviders(<BillingPeriodDatesEditor accountId="card-1" period={period} />);
}

describe("BillingPeriodDatesEditor", () => {
  it("sends only the changed date and closes on success", async () => {
    let body: unknown;
    server.use(
      http.patch(url, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(period);
      })
    );
    renderEditor();

    await userEvent.click(screen.getByRole("button", { name: /Edit dates/ }));
    const end = screen.getByLabelText("Period end");
    await userEvent.clear(end);
    await userEvent.type(end, "2027-02-23");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("button", { name: /Edit dates/ })).toBeInTheDocument();
    expect(body).toEqual({ closingDate: "2027-02-23" });
  });

  it("sends both dates when both changed", async () => {
    let body: unknown;
    server.use(
      http.patch(url, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(period);
      })
    );
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: /Edit dates/ }));
    await userEvent.clear(screen.getByLabelText("Period end"));
    await userEvent.type(screen.getByLabelText("Period end"), "2027-02-22");
    await userEvent.clear(screen.getByLabelText("Payment due"));
    await userEvent.type(screen.getByLabelText("Payment due"), "2027-03-18");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: /Edit dates/ });
    expect(body).toEqual({ closingDate: "2027-02-22", dueDate: "2027-03-18" });
  });

  it("sends no request when cancelled or unchanged", async () => {
    let calls = 0;
    server.use(
      http.patch(url, () => {
        calls += 1;
        return HttpResponse.json(period);
      })
    );
    renderEditor();

    await userEvent.click(screen.getByRole("button", { name: /Edit dates/ }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: /Edit dates/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("button", { name: /Edit dates/ })).toBeInTheDocument();
    expect(calls).toBe(0);
  });

  it("shows the API error and keeps the typed values", async () => {
    server.use(http.patch(url, () => HttpResponse.json({ message: "Period 2027-02: overlap" }, { status: 400 })));
    renderEditor();

    await userEvent.click(screen.getByRole("button", { name: /Edit dates/ }));
    const end = screen.getByLabelText("Period end");
    await userEvent.clear(end);
    await userEvent.type(end, "2027-01-10");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Period 2027-02: overlap");
    expect(screen.getByLabelText("Period end")).toHaveValue("2027-01-10");
  });
});
