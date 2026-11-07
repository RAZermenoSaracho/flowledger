import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { server } from "../../../../tests/mocks/server";
import type { Category } from "../../../../types/categories.types";
import type { Group } from "../../../../types/groups.types";
import type { ReportFilters } from "../../types/reports.types";
import { emptyReportFilters, ReportFiltersCard } from "../ReportFiltersCard";

const API_URL = "http://localhost:4000";

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: "group-1",
    name: "Roommates",
    ownerUserId: "user-1",
    isArchived: false,
    members: [],
    categories: [{ id: "cat-1" } as Category],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-1",
    name: "Groceries",
    type: "expense",
    isArchived: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

function mockCurrencies() {
  server.use(
    http.get(`${API_URL}/currencies`, () =>
      HttpResponse.json({
        currencies: [{ code: "USD", name: "US Dollar" }],
        fiat: [{ code: "USD", name: "US Dollar" }],
        crypto: []
      })
    )
  );
}

function baseProps(
  overrides: Partial<Parameters<typeof ReportFiltersCard>[0]> = {}
) {
  return {
    filters: emptyReportFilters,
    onFiltersChange: vi.fn(),
    groups: [makeGroup()],
    categoryOptions: [makeCategory()],
    hasActiveFilters: false,
    currency: "USD",
    onCurrencyChange: vi.fn(),
    reportAmountMode: "net" as const,
    onReportAmountModeChange: vi.fn(),
    ...overrides
  };
}

describe("ReportFiltersCard", () => {
  it("always shows every control directly, with no Filters button, popover, or collapse toggle", () => {
    mockCurrencies();
    renderWithProviders(<ReportFiltersCard {...baseProps()} />);

    expect(screen.getByLabelText("From")).toHaveAttribute(
      "type",
      "datetime-local"
    );
    expect(screen.getByLabelText("To")).toHaveAttribute(
      "type",
      "datetime-local"
    );
    expect(
      screen.queryByRole("checkbox", { name: /specific time/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Groups All groups" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Categories All categories" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Currency")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Report amount basis" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Filters/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stacks the controls responsively without hiding any of them", () => {
    mockCurrencies();
    const { container } = renderWithProviders(
      <ReportFiltersCard {...baseProps()} />
    );

    expect(container.querySelector(".hidden")).toBeNull();
    expect(
      container.querySelector(".grid-cols-1.md\\:grid-cols-2")
    ).not.toBeNull();
  });

  it("calls onFiltersChange with a full date-time when the date fields change", () => {
    mockCurrencies();
    const props = baseProps();
    renderWithProviders(<ReportFiltersCard {...props} />);

    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2024-01-01T00:00" }
    });

    expect(props.onFiltersChange).toHaveBeenCalledWith({
      ...emptyReportFilters,
      dateFrom: "2024-01-01T00:00"
    });
  });

  it("shows a timed bound in one datetime-local field and a bare saved date at its default time", () => {
    mockCurrencies();
    renderWithProviders(
      <ReportFiltersCard
        {...baseProps({
          hasActiveFilters: true,
          filters: {
            ...emptyReportFilters,
            dateFrom: "2026-11-05",
            dateTo: "2026-11-05T14:30"
          }
        })}
      />
    );

    expect(screen.getByLabelText("From")).toHaveValue("2026-11-05T00:00");
    expect(screen.getByLabelText("To")).toHaveValue("2026-11-05T14:30");
  });

  it("hides 'Reset filters' when hasActiveFilters is false, shows it and resets when true", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps({ hasActiveFilters: true });
    renderWithProviders(<ReportFiltersCard {...props} />);

    const resetButton = screen.getByRole("button", { name: "Reset filters" });
    await user.click(resetButton);

    expect(props.onFiltersChange).toHaveBeenCalledWith(emptyReportFilters);
  });

  it("calls onReportAmountModeChange when a different mode is clicked", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<ReportFiltersCard {...props} />);

    await user.click(screen.getByRole("button", { name: "Gross" }));

    expect(props.onReportAmountModeChange).toHaveBeenCalledWith("gross");
  });

  it("selecting groups narrows categoryIds to only categories within the selected groups", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps({
      filters: {
        ...emptyReportFilters,
        categoryIds: ["cat-1", "cat-outside-group"]
      } as ReportFilters
    });
    renderWithProviders(<ReportFiltersCard {...props} />);

    await user.click(screen.getByRole("button", { name: "Groups All groups" }));
    await user.click(screen.getByRole("checkbox", { name: "Roommates" }));

    expect(props.onFiltersChange).toHaveBeenCalledWith({
      ...props.filters,
      groupIds: ["group-1"],
      categoryIds: ["cat-1"]
    });
  });

  it("filters out a categoryId that isn't in categoryOptions when selecting categories", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<ReportFiltersCard {...props} />);

    await user.click(
      screen.getByRole("button", { name: "Categories All categories" })
    );
    await user.click(screen.getByRole("checkbox", { name: "Groceries" }));

    expect(props.onFiltersChange).toHaveBeenCalledWith({
      ...props.filters,
      categoryIds: ["cat-1"]
    });
  });
});
