import { screen, waitFor } from "@testing-library/react";
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

function baseProps(overrides: Partial<Parameters<typeof ReportFiltersCard>[0]> = {}) {
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
  it("renders date/group/category filters and the amount-mode toggle", async () => {
    mockCurrencies();
    renderWithProviders(<ReportFiltersCard {...baseProps()} />);

    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Report amount basis" })).toBeInTheDocument();
  });

  it("calls onFiltersChange when the date fields change", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<ReportFiltersCard {...props} />);

    await user.type(screen.getByLabelText("From"), "2024-01-01");

    expect(props.onFiltersChange).toHaveBeenCalled();
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
      filters: { ...emptyReportFilters, categoryIds: ["cat-1", "cat-outside-group"] } as ReportFilters
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

    await user.click(screen.getByRole("button", { name: "Categories All categories" }));
    await user.click(screen.getByRole("checkbox", { name: "Groceries" }));

    expect(props.onFiltersChange).toHaveBeenCalledWith({
      ...props.filters,
      categoryIds: ["cat-1"]
    });
  });

  it("toggles the mobile filters section open/closed", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    renderWithProviders(<ReportFiltersCard {...baseProps()} />);

    const toggle = screen.getByRole("button", { name: "Filters" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("shows '(active)' in the mobile toggle label when hasActiveFilters is true", async () => {
    mockCurrencies();
    renderWithProviders(<ReportFiltersCard {...baseProps({ hasActiveFilters: true })} />);
    expect(screen.getByRole("button", { name: "Filters (active)" })).toBeInTheDocument();
  });
});
