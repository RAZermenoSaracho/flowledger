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
  it("renders a compact toolbar and keeps the filter controls inside a Filters popover", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    renderWithProviders(<ReportFiltersCard {...baseProps()} />);

    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Report amount basis" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Currency")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Filters" }));

    expect(screen.getByLabelText("From")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("To")).toHaveAttribute("type", "date");
    expect(screen.getByRole("button", { name: "Groups All groups" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters" })).toHaveFocus();
  });

  it("calls onFiltersChange when the date fields change", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<ReportFiltersCard {...props} />);

    await user.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2024-01-01" } });

    expect(props.onFiltersChange).toHaveBeenCalledWith({ ...emptyReportFilters, dateFrom: "2024-01-01" });
  });

  it("uses one datetime-local field for a timed bound and summarizes active filters", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const props = baseProps({
      hasActiveFilters: true,
      filters: { ...emptyReportFilters, dateTo: "2026-11-05T14:30", groupIds: ["group-1"] }
    });
    renderWithProviders(<ReportFiltersCard {...props} />);

    expect(screen.getByText("1 group")).toBeInTheDocument();
    expect(screen.getByText(/^To .*2026.*2:30/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filters (active)" }));
    expect(screen.getByLabelText("To")).toHaveAttribute("type", "datetime-local");
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

    await user.click(screen.getByRole("button", { name: "Filters" }));
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

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(
      screen.getByRole("button", { name: "Categories All categories" })
    );
    await user.click(screen.getByRole("checkbox", { name: "Groceries" }));

    expect(props.onFiltersChange).toHaveBeenCalledWith({
      ...props.filters,
      categoryIds: ["cat-1"]
    });
  });

  it("toggles the filters popover open/closed", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    renderWithProviders(<ReportFiltersCard {...baseProps()} />);

    const toggle = screen.getByRole("button", { name: "Filters" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Report filters" })).toBeInTheDocument();
  });

  it("shows '(active)' in the toggle label when hasActiveFilters is true", async () => {
    mockCurrencies();
    renderWithProviders(
      <ReportFiltersCard {...baseProps({ hasActiveFilters: true })} />
    );
    expect(
      screen.getByRole("button", { name: "Filters (active)" })
    ).toBeInTheDocument();
  });
});
