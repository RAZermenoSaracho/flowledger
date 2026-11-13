import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { server } from "../../../tests/mocks/server";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import type { SharedExpense } from "../../../types/sharedExpenses.types";
import { SharedExpenseDetailPage } from "../SharedExpenseDetailPage";

const API_URL = "http://localhost:4000";

const sharedExpense: SharedExpense = {
  id: "se-1",
  transactionId: "tx-1",
  ownerUserId: "user-1",
  title: "Dinner split",
  totalAmount: "100",
  status: "open",
  transaction: {
    id: "tx-1",
    name: "Dinner",
    type: "expense",
    executionCurrency: "USD",
    date: "2024-01-01T10:00:00.000Z"
  } as SharedExpense["transaction"],
  owner: { id: "user-1", username: "jane", nickname: null, displayName: "Jane" },
  participants: [
    {
      id: "p-1",
      userId: "user-2",
      participantName: "Friend",
      currency: "USD",
      shareAmount: "50",
      paidAmount: "20",
      status: "partial",
      acceptance: "accepted"
    }
  ],
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
};

function mock(userId: string, found = true) {
  server.use(
    http.post(`${API_URL}/auth/refresh`, () =>
      HttpResponse.json({
        token: "tok",
        user: {
          id: userId,
          name: "Jane",
          email: "jane@example.com",
          planType: "free",
          mobileSidebarSide: "left",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z"
        }
      })
    ),
    http.get(`${API_URL}/shared-expenses/se-1`, () =>
      found
        ? HttpResponse.json({ sharedExpense })
        : HttpResponse.json({ message: "Not found" }, { status: 404 })
    )
  );
}

function LocationProbe() {
  const location = useLocation();
  return (
    <p data-testid="location">
      {location.pathname + location.search}|{JSON.stringify(location.state)}
    </p>
  );
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/debts/shared-expenses/:id" element={<SharedExpenseDetailPage />} />
      <Route path="/transactions/:id" element={<LocationProbe />} />
    </Routes>,
    { route: "/debts/shared-expenses/se-1", withAuth: true }
  );
}

describe("SharedExpenseDetailPage", () => {
  it("lets the owner save a changed title with only that key", async () => {
    mock("user-1");
    let body: unknown;
    server.use(
      http.put(`${API_URL}/shared-expenses/se-1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ sharedExpense });
      })
    );
    const user = userEvent.setup();
    renderPage();

    const title = await screen.findByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Lunch");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(body).toEqual({ title: "Lunch" }));
  });

  it("shows the participants with their response", async () => {
    mock("user-1");
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText("Title");
    await user.click(screen.getByRole("tab", { name: "Participants" }));

    expect(screen.getByText("Friend")).toBeInTheDocument();
    expect(screen.getByText("App user")).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  it("renders read-only for a participant, with no Save and no actions", async () => {
    mock("user-2");
    renderPage();

    expect(await screen.findByRole("heading", { name: "Dinner split" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /actions/i })).not.toBeInTheDocument();
  });

  it("opens the transaction Sharing tab from the Manage participants action", async () => {
    mock("user-1");
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText("Title");
    await user.click(screen.getByRole("button", { name: /actions/i }));
    await user.click(screen.getByRole("menuitem", { name: "Manage participants" }));

    expect(screen.getByTestId("location")).toHaveTextContent(
      '/transactions/tx-1?tab=sharing|{"from":"/debts/shared-expenses/se-1"}'
    );
  });

  it("opens the transaction from the Open transaction action", async () => {
    mock("user-1");
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText("Title");
    await user.click(screen.getByRole("button", { name: /actions/i }));
    await user.click(screen.getByRole("menuitem", { name: "Open transaction" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/transactions/tx-1|");
  });

  it("points the back arrow at the shared expenses tab", async () => {
    mock("user-1");
    renderPage();

    await screen.findByLabelText("Title");
    expect(screen.getByRole("link", { name: "Back to shared expenses" })).toHaveAttribute(
      "href",
      "/debts?tab=sharedExpenses"
    );
  });

  it("shows not found when the shared expense does not exist", async () => {
    mock("user-1", false);
    renderPage();

    expect(await screen.findByText("Shared expense not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to shared expenses" })).toHaveAttribute(
      "href",
      "/debts?tab=sharedExpenses"
    );
  });
});
