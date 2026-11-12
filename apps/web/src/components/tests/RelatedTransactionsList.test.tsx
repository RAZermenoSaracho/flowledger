import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../tests/mocks/server";
import { renderWithProviders } from "../../tests/utils/renderWithProviders";
import type { Transaction } from "../../types/transactions.types";
import { RelatedTransactionsList } from "../RelatedTransactionsList";

const API_URL = "http://localhost:4000";

function tx(id: string, name: string): Transaction {
  return {
    id,
    name,
    amount: "12.5",
    executionCurrency: "USD",
    exchangeRate: 1,
    amountInPreferredCurrency: 12.5,
    type: "expense",
    date: "2024-03-05T15:00:00.000Z",
    account: { id: "a1", name: "Checking" },
    category: { id: "c1", name: "Food" },
    createdAt: "",
    updatedAt: ""
  } as Transaction;
}

function meta(page: number, hasNext: boolean, total = 21) {
  return {
    total,
    page,
    pageSize: 20,
    pageCount: Math.max(1, Math.ceil(total / 20)),
    hasNext,
    hasPrevious: page > 1,
    executionTime: 1
  };
}

type Query = { where: unknown; sort: unknown; pagination: { page: number; pageSize: number } };

function mockTransactions(respond: (query: Query) => Response | object) {
  const queries: Query[] = [];
  server.use(
    http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    http.get(`${API_URL}/transactions`, ({ request }) => {
      const query = JSON.parse(new URL(request.url).searchParams.get("query")!);
      queries.push(query);
      const result = respond(query);
      return result instanceof Response ? result : HttpResponse.json(result);
    })
  );
  return queries;
}

describe("RelatedTransactionsList", () => {
  it("requests the scope newest first and pages server-side", async () => {
    const queries = mockTransactions((query) =>
      query.pagination.page === 1
        ? { data: [tx("t1", "Groceries")], meta: meta(1, true) }
        : { data: [tx("t2", "Coffee")], meta: meta(2, false) }
    );
    const user = userEvent.setup();
    renderWithProviders(
      <RelatedTransactionsList scope={{ field: "accountId", value: "acc-1" }} emptyText="Nothing" />,
      { withAuth: true }
    );

    expect(await screen.findByRole("link", { name: "Groceries" })).toHaveAttribute(
      "href",
      "/transactions/t1"
    );
    expect(screen.getByText("$12.50")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2 · 21 results")).toBeInTheDocument();
    expect(screen.queryByText("Account")).not.toBeInTheDocument();
    expect(queries[0]).toMatchObject({
      where: { field: "accountId", op: "=", value: "acc-1" },
      sort: [{ field: "date", direction: "desc" }],
      pagination: { kind: "offset", page: 1, pageSize: 20 }
    });

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("link", { name: "Coffee" })).toBeInTheDocument();
    expect(queries.at(-1)?.pagination.page).toBe(2);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows an Account column for a group scope", async () => {
    mockTransactions(() => ({ data: [tx("t1", "Groceries")], meta: meta(1, false, 1) }));
    renderWithProviders(
      <RelatedTransactionsList scope={{ field: "groupId", value: "g1" }} emptyText="Nothing" />,
      { withAuth: true }
    );
    expect(await screen.findByText("Checking")).toBeInTheDocument();
    expect(screen.getAllByText("Account").length).toBeGreaterThan(0);
  });

  it("ANDs a name search with the scope and returns to page 1", async () => {
    const queries = mockTransactions(() => ({ data: [tx("t1", "Groceries")], meta: meta(1, true) }));
    const user = userEvent.setup();
    renderWithProviders(
      <RelatedTransactionsList scope={{ field: "accountId", value: "acc-1" }} emptyText="Nothing" />,
      { withAuth: true }
    );
    await screen.findByRole("link", { name: "Groceries" });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText(/Page 2/);

    await user.type(screen.getByPlaceholderText("Search by name"), "cof{Enter}");

    await screen.findByText(/Page 1 of/);
    expect(queries.at(-1)).toMatchObject({
      where: {
        and: [
          { field: "accountId", op: "=", value: "acc-1" },
          { field: "name", op: "ilike", value: "cof" }
        ]
      },
      pagination: { page: 1 }
    });
  });

  it("shows the empty text and an error state", async () => {
    mockTransactions(() => ({ data: [], meta: meta(1, false, 0) }));
    const { unmount } = renderWithProviders(
      <RelatedTransactionsList scope={{ field: "groupId", value: "g1" }} emptyText="Nothing here" />,
      { withAuth: true }
    );
    expect(await screen.findByText("Nothing here")).toBeInTheDocument();
    unmount();

    mockTransactions(() => HttpResponse.json({ message: "boom" }, { status: 500 }));
    renderWithProviders(
      <RelatedTransactionsList scope={{ field: "groupId", value: "g1" }} emptyText="Nothing here" />,
      { withAuth: true }
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load transactions.");
  });
});
