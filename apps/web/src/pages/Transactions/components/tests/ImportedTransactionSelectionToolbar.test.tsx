import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Category } from "../../../../types/categories.types";
import { ImportedTransactionSelectionToolbar } from "../ImportedTransactionSelectionToolbar";

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-1",
    name: "Groceries",
    type: "expense",
    isArchived: false,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function baseProps(overrides: Partial<Parameters<typeof ImportedTransactionSelectionToolbar>[0]> = {}) {
  return {
    totalFilteredCount: 5,
    visibleCount: 5,
    selectedCount: 0,
    selectedVisibleCount: 0,
    allFilteredSelected: false,
    batchCategoryId: "",
    categories: [makeCategory()],
    isPendingFilter: true,
    isIgnoredFilter: false,
    isImporting: false,
    isIgnoring: false,
    isUnignoring: false,
    onBatchCategoryChange: vi.fn(),
    onVisibleSelectionChange: vi.fn(),
    onAllFilteredSelectionChange: vi.fn(),
    onImportSelected: vi.fn(),
    onIgnoreSelected: vi.fn(),
    onUnignoreSelected: vi.fn(),
    ...overrides
  };
}

describe("ImportedTransactionSelectionToolbar", () => {
  it("shows the selected-count message when nothing is selected", () => {
    renderWithProviders(<ImportedTransactionSelectionToolbar {...baseProps()} />);
    expect(screen.getByText("0 imported transactions selected.")).toBeInTheDocument();
  });

  it("uses singular phrasing for exactly one selected", () => {
    renderWithProviders(<ImportedTransactionSelectionToolbar {...baseProps({ selectedCount: 1 })} />);
    expect(screen.getByText("1 imported transaction selected.")).toBeInTheDocument();
  });

  it("shows the all-filtered-selected message and 'all filtered results' scope when allFilteredSelected", () => {
    renderWithProviders(
      <ImportedTransactionSelectionToolbar {...baseProps({ allFilteredSelected: true })} />
    );
    expect(screen.getByText("All 5 filtered imported transactions are selected.")).toBeInTheDocument();
    expect(screen.getByText("Batch actions affect all filtered results.")).toBeInTheDocument();
  });

  it("shows Import/Ignore buttons only while isPendingFilter", () => {
    renderWithProviders(<ImportedTransactionSelectionToolbar {...baseProps()} />);
    expect(screen.getByRole("button", { name: /Import/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ignore/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unignore/ })).not.toBeInTheDocument();
  });

  it("shows the Unignore button only while isIgnoredFilter", () => {
    renderWithProviders(
      <ImportedTransactionSelectionToolbar
        {...baseProps({ isPendingFilter: false, isIgnoredFilter: true })}
      />
    );
    expect(screen.getByRole("button", { name: /Unignore/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Import/ })).not.toBeInTheDocument();
  });

  it("disables Import/Ignore when nothing is selected, enables once something is", () => {
    const { rerender } = renderWithProviders(
      <ImportedTransactionSelectionToolbar {...baseProps()} />
    );
    expect(screen.getByRole("button", { name: /Import/ })).toBeDisabled();

    rerender(<ImportedTransactionSelectionToolbar {...baseProps({ selectedCount: 2 })} />);
    expect(screen.getByRole("button", { name: /Import/ })).not.toBeDisabled();
  });

  it("disables the batch category select unless isPendingFilter", () => {
    renderWithProviders(
      <ImportedTransactionSelectionToolbar {...baseProps({ isPendingFilter: false })} />
    );
    expect(screen.getByLabelText("Batch category")).toBeDisabled();
  });

  it("calls onImportSelected/onIgnoreSelected from their buttons", async () => {
    const user = userEvent.setup();
    const props = baseProps({ selectedCount: 1 });
    renderWithProviders(<ImportedTransactionSelectionToolbar {...props} />);

    await user.click(screen.getByRole("button", { name: /Import/ }));
    expect(props.onImportSelected).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: /Ignore/ }));
    expect(props.onIgnoreSelected).toHaveBeenCalledOnce();
  });

  it("calls onVisibleSelectionChange/onAllFilteredSelectionChange from the checkboxes", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<ImportedTransactionSelectionToolbar {...props} />);

    await user.click(screen.getByRole("checkbox", { name: "Select visible rows" }));
    expect(props.onVisibleSelectionChange).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole("checkbox", { name: "Select all filtered results" }));
    expect(props.onAllFilteredSelectionChange).toHaveBeenCalledWith(true);
  });

  it("marks 'Select visible rows' checked when every visible row is selected", () => {
    renderWithProviders(
      <ImportedTransactionSelectionToolbar
        {...baseProps({ selectedVisibleCount: 5, visibleCount: 5 })}
      />
    );
    expect(screen.getByRole("checkbox", { name: "Select visible rows" })).toBeChecked();
  });

  it("calls onBatchCategoryChange when the category select changes", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<ImportedTransactionSelectionToolbar {...props} />);

    await user.selectOptions(screen.getByLabelText("Batch category"), "cat-1");

    expect(props.onBatchCategoryChange).toHaveBeenCalledWith("cat-1");
  });
});
