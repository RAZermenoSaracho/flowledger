import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../tests/utils/renderWithProviders";
import { PageHeader } from "../PageHeader";

describe("PageHeader", () => {
  it("renders the title", () => {
    renderWithProviders(<PageHeader title="Transactions" />);
    expect(screen.getByRole("heading", { name: "Transactions" })).toBeInTheDocument();
  });

  it("renders the action when provided", () => {
    renderWithProviders(<PageHeader title="Transactions" action={<button>Add</button>} />);
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("omits the action wrapper when none is provided", () => {
    const { container } = renderWithProviders(<PageHeader title="Transactions" />);
    expect(container.querySelector(".shrink-0")).not.toBeInTheDocument();
  });

  it("renders children below the title row when provided", () => {
    renderWithProviders(
      <PageHeader title="Transactions">
        <div data-testid="search-bar" />
      </PageHeader>
    );
    expect(screen.getByTestId("search-bar")).toBeInTheDocument();
  });

  it("merges a custom className onto the outer wrapper", () => {
    const { container } = renderWithProviders(
      <PageHeader title="Transactions" className="mb-4" />
    );
    expect(container.firstChild).toHaveClass("mb-4", "grid");
  });
});
