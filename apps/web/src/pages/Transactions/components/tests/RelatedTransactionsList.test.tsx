import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Transaction } from "../../../../types/transactions.types";
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

function meta(offset: number, total = 21) {
  return {
    total,
    page: null,
    pageSize: null,
    pageCount: null,
    hasNext: offset + 20 < total,
    hasPrevious: offset > 0,
    executionTime: 1
  };
}

type Query = {
  where: unknown;
  sort: unknown;
  pagination: { kind: string; offset: number; limit: number };
};

function mockTransactions(respond: (query: Query) => Response | object) {
  const queries: Query[] = [];
  server.use(
    http.get(`${API_URL}/accounts`, () => HttpResponse.json({ accounts: [] })),
    http.get(`${API_URL}/groups`, () => HttpResponse.json({ groups: [] })),
    http.get(`${API_URL}/categories`, () =>
      HttpResponse.json({ categories: [] })
    ),
    http.get(`${API_URL}/currencies`, () =>
      HttpResponse.json({ currencies: [], fiat: [], crypto: [] })
    ),
    http.post(
      `${API_URL}/auth/refresh`,
      () => new HttpResponse(null, { status: 401 })
    ),
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
  it("requests the scope newest first and pages by range", async () => {
    const queries = mockTransactions((query) =>
      query.pagination.offset === 0
        ? { data: [tx("t1", "Groceries")], meta: meta(0) }
        : { data: [tx("t2", "Coffee")], meta: meta(20) }
    );
    const user = userEvent.setup();
    renderWithProviders(
      <RelatedTransactionsList
        scope={{ field: "accountId", value: "acc-1" }}
        emptyText="Nothing"
      />,
      { withAuth: true }
    );

    expect(
      await screen.findByRole("link", { name: "Groceries" })
    ).toHaveAttribute("href", "/transactions/t1");
    expect(screen.getByText("$12.50")).toBeInTheDocument();
    expect(screen.getByText("1-20 / 21")).toBeInTheDocument();
    expect(screen.queryByText("Account")).not.toBeInTheDocument();
    expect(queries[0]).toMatchObject({
      where: { field: "accountId", op: "=", value: "acc-1" },
      sort: [{ field: "date", direction: "desc" }],
      pagination: { kind: "range", offset: 0, limit: 20 }
    });

    await user.click(screen.getByRole("button", { name: "Next records" }));
    expect(
      await screen.findByRole("link", { name: "Coffee" })
    ).toBeInTheDocument();
    expect(queries.at(-1)?.pagination.offset).toBe(20);
    expect(screen.getByRole("button", { name: "Next records" })).toBeDisabled();
  });

  it("offers the full transaction filter fields", async () => {
    mockTransactions(() => ({
      data: [tx("t1", "Groceries")],
      meta: meta(0, 1)
    }));
    const user = userEvent.setup();
    renderWithProviders(
      <RelatedTransactionsList
        scope={{ field: "groupId", value: "g1" }}
        emptyText="Nothing"
      />,
      { withAuth: true }
    );
    await screen.findByRole("link", { name: "Groceries" });
    await user.click(
      screen.getByRole("button", { name: "Filter, group, and sort" })
    );
    await user.click(screen.getByRole("button", { name: "Edit filters" }));
    await user.click(screen.getByRole("button", { name: "+ Condition" }));
    const options = Array.from(
      screen.getByLabelText("Field").querySelectorAll("option")
    ).map((option) => option.textContent);
    expect(options).toEqual(
      expect.arrayContaining(["Amount", "Category", "Date", "Type"])
    );
  });

  it("keeps the group scope AND-ed with an Amount condition from the filter builder", async () => {
    const queries = mockTransactions(() => ({
      data: [tx("t1", "Groceries")],
      meta: meta(0, 1)
    }));
    const user = userEvent.setup();
    renderWithProviders(
      <RelatedTransactionsList
        scope={{ field: "groupId", value: "g1" }}
        emptyText="Nothing"
      />,
      { withAuth: true }
    );
    await screen.findByRole("link", { name: "Groceries" });
    expect(queries[0]?.where).toEqual({
      field: "groupId",
      op: "=",
      value: "g1"
    });
    await user.click(
      screen.getByRole("button", { name: "Filter, group, and sort" })
    );
    await user.click(screen.getByRole("button", { name: "Edit filters" }));
    await user.click(screen.getByRole("button", { name: "+ Condition" }));
    await user.selectOptions(screen.getByLabelText("Field"), "Amount");
    await user.type(screen.getByLabelText("Value"), "5");
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(JSON.stringify(queries.at(-1)?.where)).toContain(
        '"field":"amount"'
      )
    );
    expect(queries.at(-1)?.where).toMatchObject({
      and: [{ field: "groupId", op: "=", value: "g1" }, expect.anything()]
    });
  });

  it("keeps the where when the sort changes and when paging", async () => {
    const queries = mockTransactions(() => ({
      data: [tx("t1", "Groceries")],
      meta: meta(0)
    }));
    const user = userEvent.setup();
    renderWithProviders(
      <RelatedTransactionsList
        scope={{ field: "accountId", value: "acc-1" }}
        emptyText="Nothing"
      />,
      { withAuth: true }
    );
    await screen.findByRole("link", { name: "Groceries" });
    await user.type(screen.getByLabelText("Search transactions"), "cof{Enter}");
    const where = {
      and: [
        { field: "accountId", op: "=", value: "acc-1" },
        { field: "name", op: "ilike", value: "cof" }
      ]
    };
    await waitFor(() => expect(queries.at(-1)?.where).toEqual(where));

    await user.click(screen.getByRole("button", { name: "Next records" }));
    await waitFor(() => expect(queries.at(-1)?.pagination.offset).toBe(20));
    expect(queries.at(-1)?.where).toEqual(where);

    await user.click(
      screen.getByRole("button", { name: "Filter, group, and sort" })
    );
    await user.click(screen.getByRole("button", { name: "Sort descending" }));
    await waitFor(() =>
      expect(queries.at(-1)?.sort).toEqual([
        { field: "date", direction: "asc" }
      ])
    );
    expect(queries.at(-1)?.where).toEqual(where);
  });

  it("shows an Account column for a group scope", async () => {
    mockTransactions(() => ({
      data: [tx("t1", "Groceries")],
      meta: meta(0, 1)
    }));
    renderWithProviders(
      <RelatedTransactionsList
        scope={{ field: "groupId", value: "g1" }}
        emptyText="Nothing"
      />,
      { withAuth: true }
    );
    expect(await screen.findByText("Checking")).toBeInTheDocument();
    expect(screen.getAllByText("Account").length).toBeGreaterThan(0);
  });

  it("ANDs a name search with the scope and returns to page 1", async () => {
    const queries = mockTransactions(() => ({
      data: [tx("t1", "Groceries")],
      meta: meta(0)
    }));
    const user = userEvent.setup();
    renderWithProviders(
      <RelatedTransactionsList
        scope={{ field: "accountId", value: "acc-1" }}
        emptyText="Nothing"
      />,
      { withAuth: true }
    );
    await screen.findByRole("link", { name: "Groceries" });
    await user.click(screen.getByRole("button", { name: "Next records" }));
    await screen.findByText("21-21 / 21");

    await user.type(screen.getByLabelText("Search transactions"), "cof{Enter}");

    await screen.findByText("1-20 / 21");
    expect(queries.at(-1)).toMatchObject({
      where: {
        and: [
          { field: "accountId", op: "=", value: "acc-1" },
          { field: "name", op: "ilike", value: "cof" }
        ]
      },
      pagination: { offset: 0 }
    });
  });

  it("shows the empty text and an error state", async () => {
    mockTransactions(() => ({ data: [], meta: meta(0, 0) }));
    const { unmount } = renderWithProviders(
      <RelatedTransactionsList
        scope={{ field: "groupId", value: "g1" }}
        emptyText="Nothing here"
      />,
      { withAuth: true }
    );
    expect(await screen.findByText("Nothing here")).toBeInTheDocument();
    unmount();

    mockTransactions(() =>
      HttpResponse.json({ message: "boom" }, { status: 500 })
    );
    renderWithProviders(
      <RelatedTransactionsList
        scope={{ field: "groupId", value: "g1" }}
        emptyText="Nothing here"
      />,
      { withAuth: true }
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load transactions."
    );
  });
});
