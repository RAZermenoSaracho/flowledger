import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { ImportedTransactionsFiltersCard } from "../ImportedTransactionsFiltersCard";

describe("ImportedTransactionsFiltersCard", () => {
  it("renders the search bar with the imported-transactions placeholder", () => {
    renderWithProviders(
      <ImportedTransactionsFiltersCard
        resetKey={0}
        initialStatus={null}
        onQueryChange={vi.fn()}
        accounts={[]}
        categories={[]}
        providerAccountOptions={[]}
      />
    );

    expect(screen.getByLabelText("Search imported transactions")).toBeInTheDocument();
  });

  it("seeds a status filter pill from initialStatus", () => {
    renderWithProviders(
      <ImportedTransactionsFiltersCard
        resetKey={0}
        initialStatus="pending"
        onQueryChange={vi.fn()}
        accounts={[]}
        categories={[]}
        providerAccountOptions={[]}
      />
    );

    expect(screen.getByText("Status is pending")).toBeInTheDocument();
  });

  it("calls onQueryChange on mount", async () => {
    const onQueryChange = vi.fn();
    renderWithProviders(
      <ImportedTransactionsFiltersCard
        resetKey={0}
        initialStatus={null}
        onQueryChange={onQueryChange}
        accounts={[]}
        categories={[]}
        providerAccountOptions={[]}
      />
    );

    expect(onQueryChange).toHaveBeenCalled();
  });

  it("remounts the search bar (resetting its state) when resetKey changes", () => {
    const { rerender } = renderWithProviders(
      <ImportedTransactionsFiltersCard
        resetKey={0}
        initialStatus="pending"
        onQueryChange={vi.fn()}
        accounts={[]}
        categories={[]}
        providerAccountOptions={[]}
      />
    );
    expect(screen.getByText("Status is pending")).toBeInTheDocument();

    rerender(
      <ImportedTransactionsFiltersCard
        resetKey={1}
        initialStatus="ignored"
        onQueryChange={vi.fn()}
        accounts={[]}
        categories={[]}
        providerAccountOptions={[]}
      />
    );

    expect(screen.getByText("Status is ignored")).toBeInTheDocument();
  });
});
