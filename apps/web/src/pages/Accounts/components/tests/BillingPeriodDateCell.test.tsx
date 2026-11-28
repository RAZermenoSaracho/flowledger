import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, delay, http } from "msw";
import { describe, expect, it } from "vitest";
import { makePeriod } from "../../../../tests/fixtures/creditCardBilling";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { BillingPeriodDateCell } from "../BillingPeriodDateCell";

const url = "http://localhost:4000/accounts/card-1/credit-card/periods/2027-02";
const dateInput = () =>
  screen.getByLabelText(/^Period end, period 2027-02/) as HTMLInputElement;
const editButton = () =>
  screen.getByRole("button", { name: /Edit Period end of period 2027-02/ });

function capture(
  response: () => Response | Promise<Response> = () =>
    HttpResponse.json(makePeriod())
) {
  const bodies: unknown[] = [];
  server.use(
    http.patch(url, async ({ request }) => {
      bodies.push(await request.json());
      return response();
    })
  );
  return bodies;
}

const renderEnd = (over = {}) =>
  renderWithProviders(
    <BillingPeriodDateCell
      accountId="card-1"
      period={makePeriod(over)}
      field="end"
    />
  );

describe("BillingPeriodDateCell", () => {
  it("shows the date as a keyboard-focusable button, with no marker or reset by default", () => {
    renderEnd();
    expect(editButton()).toBeInTheDocument();
    expect(screen.queryByText("Adjusted")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Reset/ })
    ).not.toBeInTheDocument();
  });

  it("turns into a date input on click and saves the new end on Enter, returning focus", async () => {
    const bodies = capture();
    renderEnd();
    await userEvent.click(editButton());
    expect(dateInput()).toHaveFocus();
    await userEvent.clear(dateInput());
    await userEvent.type(dateInput(), "2027-02-23{Enter}");

    await waitFor(() => expect(editButton()).toHaveFocus());
    expect(bodies).toEqual([{ closingDate: "2027-02-23" }]);
  });

  it("saves the due date with dueDate", async () => {
    const bodies = capture();
    renderWithProviders(
      <BillingPeriodDateCell
        accountId="card-1"
        period={makePeriod()}
        field="due"
      />
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Edit Payment due of period/ })
    );
    const input = screen.getByLabelText(/^Payment due, period/);
    await userEvent.clear(input);
    await userEvent.type(input, "2027-03-25");
    await userEvent.tab();
    await waitFor(() => expect(bodies).toEqual([{ dueDate: "2027-03-25" }]));
  });

  it("works from the keyboard alone: Enter opens the editor", async () => {
    const bodies = capture();
    renderEnd();
    await userEvent.tab();
    expect(editButton()).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(dateInput()).toHaveFocus();
    await userEvent.clear(dateInput());
    await userEvent.type(dateInput(), "2027-02-22{Enter}");
    await waitFor(() => expect(bodies).toHaveLength(1));
  });

  it("restores the value and sends nothing on Escape", async () => {
    const bodies = capture();
    renderEnd();
    await userEvent.click(editButton());
    await userEvent.clear(dateInput());
    await userEvent.type(dateInput(), "2027-02-23");
    await userEvent.keyboard("{Escape}");

    expect(
      screen.queryByLabelText(/^Period end, period/)
    ).not.toBeInTheDocument();
    expect(editButton()).toHaveFocus();
    expect(editButton()).toHaveAccessibleName(/currently/);
    expect(bodies).toEqual([]);
  });

  it("sends nothing when blurred unchanged", async () => {
    const bodies = capture();
    renderEnd();
    await userEvent.click(editButton());
    await userEvent.tab();
    expect(
      screen.queryByLabelText(/^Period end, period/)
    ).not.toBeInTheDocument();
    expect(bodies).toEqual([]);
  });

  it("shows Saving… while the request is in flight", async () => {
    capture(async () => {
      await delay(100);
      return HttpResponse.json(makePeriod());
    });
    renderEnd();
    await userEvent.click(editButton());
    await userEvent.clear(dateInput());
    await userEvent.type(dateInput(), "2027-02-23{Enter}");
    expect(await screen.findByRole("status")).toHaveTextContent("Saving");
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument()
    );
  });

  it("keeps the input and typed value on an API error, announces it, and allows a corrected retry", async () => {
    let calls = 0;
    const bodies = capture(() =>
      ++calls === 1
        ? HttpResponse.json(
            { message: "Closing date overlaps" },
            { status: 400 }
          )
        : HttpResponse.json(makePeriod())
    );
    renderEnd();
    await userEvent.click(editButton());
    await userEvent.clear(dateInput());
    await userEvent.type(dateInput(), "2027-02-01{Enter}");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Closing date overlaps");
    expect(alert.parentElement).toHaveAttribute("aria-live", "polite");
    expect(dateInput()).toHaveValue("2027-02-01");
    expect(dateInput()).toHaveAttribute("aria-invalid", "true");

    await userEvent.clear(dateInput());
    await userEvent.type(dateInput(), "2027-02-22{Enter}");
    await waitFor(() => expect(editButton()).toBeInTheDocument());
    expect(bodies).toEqual([
      { closingDate: "2027-02-01" },
      { closingDate: "2027-02-22" }
    ]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("marks an adjusted date with its default and resets it with null, returning focus", async () => {
    const bodies = capture();
    renderEnd({
      end: "2027-02-23",
      endAdjusted: true,
      defaultEnd: "2027-02-20"
    });

    expect(screen.getByText("Adjusted")).toBeInTheDocument();
    expect(screen.getByText(/^Default /)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /Reset Period end to default/ })
    );

    await waitFor(() => expect(editButton()).toHaveFocus());
    expect(bodies).toEqual([{ closingDate: null }]);
  });

  it("resets the due date with dueDate null and shows an API error inline", async () => {
    const bodies = capture(() =>
      HttpResponse.json({ message: "Cannot reset" }, { status: 400 })
    );
    const period = makePeriod({
      dueDate: "2027-03-25",
      dueAdjusted: true,
      defaultDue: "2027-03-20"
    });
    renderWithProviders(
      <BillingPeriodDateCell accountId="card-1" period={period} field="due" />
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Reset Payment due to default/ })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reset");
    expect(bodies).toEqual([{ dueDate: null }]);
  });
});
