import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Account } from "../../../../types/accounts.types";
import { AccountDetailPage } from "../../AccountDetailPage";

vi.mock("../../utils/syncfyWidget", () => ({ openSyncfyWidget: vi.fn() }));

const API_URL = "http://localhost:4000";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc-1",
    name: "Visa",
    type: "credit_card",
    currency: "MXN",
    initialBalance: "0",
    isArchived: false,
    source: "manual",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

function renderPage(account: Account, onPut?: (body: unknown) => void) {
  server.use(
    http.post(
      `${API_URL}/auth/refresh`,
      () => new HttpResponse(null, { status: 401 })
    ),
    http.get(`${API_URL}/accounts`, () =>
      HttpResponse.json({ accounts: [account] })
    ),
    http.get(`${API_URL}/currencies`, () =>
      HttpResponse.json({ currencies: [], fiat: [], crypto: [] })
    ),
    http.get(`${API_URL}/providers/connectors`, () =>
      HttpResponse.json({ connectors: [] })
    ),
    http.get(`${API_URL}/providers/accounts`, () =>
      HttpResponse.json({ accounts: [] })
    ),
    http.put(`${API_URL}/accounts/acc-1`, async ({ request }) => {
      onPut?.(await request.json());
      return HttpResponse.json({ account });
    })
  );
  return renderWithProviders(
    <Routes>
      <Route path="/accounts/:id" element={<AccountDetailPage />} />
    </Routes>,
    { route: "/accounts/acc-1", withAuth: true }
  );
}

describe("CreditCardSection", () => {
  it("is shown only for credit card accounts", async () => {
    renderPage(makeAccount({ type: "checking" }));
    await screen.findByLabelText("Name");
    expect(screen.queryByLabelText("Credit limit")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Credit card" })
    ).not.toBeInTheDocument();
  });

  it("shows the card fields and the Credit card tab for a card", async () => {
    renderPage(makeAccount({ creditLimit: "30000", statementClosingDay: 20 }));
    expect(await screen.findByLabelText("Credit limit")).toHaveValue(30000);
    expect(screen.getByLabelText("Statement closing day")).toHaveValue(20);
    expect(
      screen.getByRole("tab", { name: "Credit card" })
    ).toBeInTheDocument();
  });

  it("saves card fields with the common ones in one request, defaulting the time zone to the device", async () => {
    const bodies: unknown[] = [];
    const user = userEvent.setup();
    renderPage(makeAccount(), (body) => bodies.push(body));

    await user.type(
      await screen.findByLabelText("Statement closing day"),
      "20"
    );
    await user.selectOptions(
      screen.getByLabelText("Payment due"),
      "day_of_next_month"
    );
    await user.type(
      screen.getByLabelText("Due day of the following month (1–20)"),
      "10"
    );
    expect(screen.getByLabelText("Billing time zone")).toHaveValue(
      Intl.DateTimeFormat().resolvedOptions().timeZone
    );
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Visa Gold");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      name: "Visa Gold",
      statementClosingDay: 20,
      paymentDueRule: "day_of_next_month",
      paymentDueValue: 10,
      billingTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  });

  it("shows a per-field error when the due value is after the closing day", async () => {
    const user = userEvent.setup();
    renderPage(makeAccount());

    await user.type(await screen.findByLabelText("Statement closing day"), "5");
    await user.selectOptions(
      screen.getByLabelText("Payment due"),
      "day_of_next_month"
    );
    await user.type(
      screen.getByLabelText("Due day of the following month (1–5)"),
      "10"
    );

    expect(
      await screen.findByText(
        /With a closing day of 5, the due day can be at most 5/
      )
    ).toBeInTheDocument();
  });

  it("offers the two due options and a rule-specific value label", async () => {
    const user = userEvent.setup();
    renderPage(makeAccount());
    const select = await screen.findByLabelText("Payment due");
    expect(
      screen.getByRole("option", { name: "Days after statement closing" })
    ).toHaveValue("days_after_closing");
    expect(
      screen.getByRole("option", {
        name: "On a fixed day of the following month"
      })
    ).toHaveValue("day_of_next_month");

    await user.selectOptions(select, "days_after_closing");
    expect(screen.getByLabelText("Days after closing (1–28)")).toHaveAttribute(
      "max",
      "28"
    );
    await user.type(screen.getByLabelText("Statement closing day"), "15");
    await user.selectOptions(select, "day_of_next_month");
    expect(
      screen.getByLabelText("Due day of the following month (1–15)")
    ).toHaveAttribute("max", "15");
  });

  it("shows a worked example for valid input and an explanation otherwise", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2027, 0, 5));
    try {
      const user = userEvent.setup();
      renderPage(makeAccount());
      expect(
        await screen.findByText(/last day included in each statement/)
      ).toBeInTheDocument();

      await user.type(screen.getByLabelText("Statement closing day"), "20");
      await user.selectOptions(
        screen.getByLabelText("Payment due"),
        "days_after_closing"
      );
      await user.type(screen.getByLabelText("Days after closing (1–28)"), "10");

      expect(
        await screen.findByText(
          /Example: the statement closing .* is due .* \(10 days later\)/
        )
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
