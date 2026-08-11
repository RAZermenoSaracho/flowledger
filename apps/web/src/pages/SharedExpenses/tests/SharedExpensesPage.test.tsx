import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { server } from "../../../tests/mocks/server";
import type { SharedExpense } from "../../../types/sharedExpenses.types";
import { SharedExpensesPage } from "../SharedExpensesPage";

const API_URL = "http://localhost:4000";

function makeSharedExpense(overrides: Partial<SharedExpense> = {}): SharedExpense {
  return {
    id: "se-1",
    transactionId: "tx-1",
    ownerUserId: "user-1",
    title: "Dinner split",
    totalAmount: 100,
    status: "open",
    participants: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

function mockBaseline(sharedExpenses: SharedExpense[] = []) {
  server.use(
    http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    http.get(`${API_URL}/shared-expenses`, () => HttpResponse.json({ sharedExpenses })),
    http.get(`${API_URL}/transactions`, () => HttpResponse.json({ data: [], meta: {} }))
  );
}

describe("SharedExpensesPage", () => {
  it("renders the list card and keeps the form card closed by default", async () => {
    mockBaseline([makeSharedExpense()]);
    renderWithProviders(<SharedExpensesPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Dinner split")).toBeInTheDocument());
    expect(screen.queryByText("New shared expense")).not.toBeInTheDocument();
  });

  it("opens the create form via the AddRecordButton", async () => {
    mockBaseline([]);
    const user = userEvent.setup();
    renderWithProviders(<SharedExpensesPage />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("No shared expenses found.")).toBeInTheDocument());
    await user.click(screen.getAllByRole("button", { name: "Add shared expense" })[0]!);

    expect(screen.getByText("New shared expense")).toBeInTheDocument();
  });

  it("opens the edit form pre-filled when editing an owned shared expense", async () => {
    mockBaseline([makeSharedExpense({ title: "Dinner split", ownerUserId: "user-1" })]);
    server.use(
      http.post(`${API_URL}/auth/refresh`, () =>
        HttpResponse.json({
          token: "tok",
          user: {
            id: "user-1",
            name: "Jane",
            email: "jane@example.com",
            planType: "free",
            mobileSidebarSide: "left",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
          }
        })
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<SharedExpensesPage />, {
      withAuth: true,
      route: "/shared-expenses"
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Actions for Dinner split" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Actions for Dinner split" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(screen.getByText("Edit shared expense")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Dinner split");
  });

  it("scrolls the highlighted shared expense into view when sharedExpenseId is in the URL", async () => {
    mockBaseline([makeSharedExpense({ id: "se-highlighted" })]);
    renderWithProviders(<SharedExpensesPage />, {
      withAuth: true,
      route: "/shared-expenses?sharedExpenseId=se-highlighted"
    });

    await waitFor(() =>
      expect(document.getElementById("shared-expense-se-highlighted")).toBeInTheDocument()
    );
  });
});
