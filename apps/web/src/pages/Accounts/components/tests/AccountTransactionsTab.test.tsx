import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Transaction } from "../../../../types/transactions.types";
import { AccountTransactionsTab } from "../AccountTransactionsTab";

const API_URL = "http://localhost:4000";

function tx(id: string, name: string): Transaction {
  return {
    id,
    name,
    amount: 12.5,
    executionCurrency: "USD",
    exchangeRate: 1,
    amountInPreferredCurrency: 12.5,
    type: "expense",
    date: "2024-03-05T15:00:00.000Z",
    category: { id: "c1", name: "Food" },
    createdAt: "",
    updatedAt: ""
  } as Transaction;
}

function meta(page: number, hasNext: boolean) {
  return {
    total: 21,
    page,
    pageSize: 20,
    pageCount: 2,
    hasNext,
    hasPrevious: page > 1,
    executionTime: 1
  };
}

describe("AccountTransactionsTab", () => {
  it("requests the account's transactions newest first and pages server-side", async () => {
    const queries: { where: unknown; sort: unknown; pagination: { page: number; pageSize: number } }[] = [];
    server.use(
      http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
      http.get(`${API_URL}/transactions`, ({ request }) => {
        const query = JSON.parse(new URL(request.url).searchParams.get("query")!);
        queries.push(query);
        const page = query.pagination.page as number;
        return HttpResponse.json(
          page === 1
            ? { data: [tx("t1", "Groceries")], meta: meta(1, true) }
            : { data: [tx("t2", "Coffee")], meta: meta(2, false) }
        );
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<AccountTransactionsTab accountId="acc-1" />, { withAuth: true });

    const link = await screen.findByRole("link", { name: "Groceries" });
    expect(link).toHaveAttribute("href", "/transactions/t1");
    expect(screen.getByText("$12.50")).toBeInTheDocument();
    expect(screen.getByText("Food")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(queries[0]).toMatchObject({
      where: { field: "accountId", op: "=", value: "acc-1" },
      sort: [
        { field: "date", direction: "desc" },
        { field: "id", direction: "desc" }
      ],
      pagination: { kind: "offset", page: 1, pageSize: 20 }
    });

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("link", { name: "Coffee" })).toBeInTheDocument();
    expect(queries.at(-1)?.pagination.page).toBe(2);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Groceries" })).toBeInTheDocument());
  });

  it("shows an empty state", async () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
      http.get(`${API_URL}/transactions`, () => HttpResponse.json({ data: [], meta: meta(1, false) }))
    );
    renderWithProviders(<AccountTransactionsTab accountId="acc-1" />, { withAuth: true });
    expect(await screen.findByText("No transactions for this account yet.")).toBeInTheDocument();
  });

  it("shows an error state", async () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
      http.get(`${API_URL}/transactions`, () => HttpResponse.json({ message: "boom" }, { status: 500 }))
    );
    renderWithProviders(<AccountTransactionsTab accountId="acc-1" />, { withAuth: true });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load transactions.");
  });
});
