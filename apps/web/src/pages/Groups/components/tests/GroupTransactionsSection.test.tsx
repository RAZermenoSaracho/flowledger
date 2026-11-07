import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Group } from "../../../../types/groups.types";
import { GroupTransactionsSection } from "../GroupTransactionsSection";

describe("GroupTransactionsSection", () => {
  it("renders each transaction's name, amount, category, and date", () => {
    const transactions: Group["transactions"] = [
      {
        id: "t1",
        name: "Groceries",
        amount: 42.5,
        executionCurrency: "USD",
        date: "2024-01-15T00:00:00.000Z",
        category: { name: "Food" }
      } as NonNullable<Group["transactions"]>[number]
    ];

    renderWithProviders(<GroupTransactionsSection transactions={transactions} />);

    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("$42.50")).toBeInTheDocument();
    expect(screen.getByText(/Food/)).toBeInTheDocument();
  });

  it("shows 'No group category' when the transaction has none", () => {
    const transactions: Group["transactions"] = [
      {
        id: "t1",
        name: "Groceries",
        amount: 42.5,
        executionCurrency: "USD",
        date: "2024-01-15T00:00:00.000Z",
        category: null
      } as NonNullable<Group["transactions"]>[number]
    ];

    renderWithProviders(<GroupTransactionsSection transactions={transactions} />);

    expect(screen.getByText(/No group category/)).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no transactions", () => {
    renderWithProviders(<GroupTransactionsSection transactions={[]} />);
    expect(
      screen.getByText("No group transactions for your account yet.")
    ).toBeInTheDocument();
  });

  it("treats undefined transactions the same as an empty list", () => {
    renderWithProviders(<GroupTransactionsSection transactions={undefined} />);
    expect(
      screen.getByText("No group transactions for your account yet.")
    ).toBeInTheDocument();
  });

  describe("date display", () => {
    const originalTz = process.env.TZ;

    afterEach(() => {
      process.env.TZ = originalTz;
    });

    const row = (overrides: Record<string, unknown>) =>
      [
        {
          id: "t1",
          name: "Groceries",
          amount: 42.5,
          executionCurrency: "USD",
          category: { name: "Food" },
          ...overrides
        } as NonNullable<Group["transactions"]>[number]
      ] as Group["transactions"];

    it.each(["America/Mexico_City", "Pacific/Kiritimati"])(
      "shows the local date and time in %s",
      (zone) => {
        process.env.TZ = zone;
        const date = "2026-11-06T03:00:00.000Z";
        renderWithProviders(<GroupTransactionsSection transactions={row({ date })} />);
        const expected = new Date(date).toLocaleString(undefined, {
          timeZone: zone,
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit"
        });
        expect(screen.getByText(`Food · ${expected}`)).toBeInTheDocument();
      }
    );

    it("shows no time for an unedited provider date at UTC noon", () => {
      process.env.TZ = "America/Mexico_City";
      const date = "2026-06-04T12:00:00.000Z";
      renderWithProviders(
        <GroupTransactionsSection
          transactions={row({ date, providerImportedTransaction: { transactionDate: date } })}
        />
      );
      const shown = new Date(date).toLocaleDateString(undefined, { timeZone: "America/Mexico_City" });
      expect(screen.getByText(`Food · ${shown}`)).toBeInTheDocument();
    });
  });
});
