import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../../services/api.client";
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

function baseProps(
  overrides: Partial<
    Parameters<typeof ImportedTransactionSelectionToolbar>[0]
  > = {}
) {
  return {
    categories: [makeCategory()],
    batchCategoryId: "",
    hasSelection: false,
    allMatching: false,
    isPendingFilter: true,
    isIgnoredFilter: false,
    isImporting: false,
    isIgnoring: false,
    isUnignoring: false,
    batchError: null,
    onBatchCategoryChange: vi.fn(),
    onImportSelected: vi.fn(),
    onIgnoreSelected: vi.fn(),
    onUnignoreSelected: vi.fn(),
    ...overrides
  };
}

describe("ImportedTransactionSelectionToolbar", () => {
  it("labels the buttons 'visible selection' normally and 'all filtered results' when allMatching", () => {
    const { rerender } = renderWithProviders(
      <ImportedTransactionSelectionToolbar {...baseProps()} />
    );
    expect(
      screen.getByRole("button", { name: "Import visible selection" })
    ).toBeInTheDocument();

    rerender(
      <ImportedTransactionSelectionToolbar
        {...baseProps({ allMatching: true })}
      />
    );
    expect(
      screen.getByRole("button", { name: "Import all filtered results" })
    ).toBeInTheDocument();
  });

  it("shows Import/Ignore buttons only while isPendingFilter", () => {
    renderWithProviders(
      <ImportedTransactionSelectionToolbar {...baseProps()} />
    );
    expect(screen.getByRole("button", { name: /Import/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ignore/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Unignore/ })
    ).not.toBeInTheDocument();
  });

  it("shows the Unignore button only while isIgnoredFilter", () => {
    renderWithProviders(
      <ImportedTransactionSelectionToolbar
        {...baseProps({ isPendingFilter: false, isIgnoredFilter: true })}
      />
    );
    expect(
      screen.getByRole("button", { name: /Unignore/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Import/ })
    ).not.toBeInTheDocument();
  });

  it("disables Import/Ignore when nothing is selected, enables once something is", () => {
    const { rerender } = renderWithProviders(
      <ImportedTransactionSelectionToolbar {...baseProps()} />
    );
    expect(screen.getByRole("button", { name: /Import/ })).toBeDisabled();

    rerender(
      <ImportedTransactionSelectionToolbar
        {...baseProps({ hasSelection: true })}
      />
    );
    expect(screen.getByRole("button", { name: /Import/ })).not.toBeDisabled();
  });

  it("disables the batch category select unless isPendingFilter", () => {
    renderWithProviders(
      <ImportedTransactionSelectionToolbar
        {...baseProps({ isPendingFilter: false })}
      />
    );
    expect(screen.getByLabelText("Batch category")).toBeDisabled();
  });

  it("calls onImportSelected/onIgnoreSelected/onUnignoreSelected from their buttons", async () => {
    const user = userEvent.setup();
    const props = baseProps({ hasSelection: true });
    const { rerender } = renderWithProviders(
      <ImportedTransactionSelectionToolbar {...props} />
    );

    await user.click(screen.getByRole("button", { name: /Import/ }));
    expect(props.onImportSelected).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: /Ignore/ }));
    expect(props.onIgnoreSelected).toHaveBeenCalledOnce();

    rerender(
      <ImportedTransactionSelectionToolbar
        {...props}
        isPendingFilter={false}
        isIgnoredFilter={true}
      />
    );
    await user.click(screen.getByRole("button", { name: /Unignore/ }));
    expect(props.onUnignoreSelected).toHaveBeenCalledOnce();
  });

  it("calls onBatchCategoryChange when the category select changes", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<ImportedTransactionSelectionToolbar {...props} />);

    await user.selectOptions(screen.getByLabelText("Batch category"), "cat-1");

    expect(props.onBatchCategoryChange).toHaveBeenCalledWith("cat-1");
  });

  it("shows the batch error message and per-row errors when batchError is set", () => {
    const error = new ApiError("Batch import failed", {
      errors: [{ id: "pt-2", message: "Missing category" }]
    });
    renderWithProviders(
      <ImportedTransactionSelectionToolbar
        {...baseProps({ batchError: error })}
      />
    );

    expect(screen.getByText("Batch import failed")).toBeInTheDocument();
    expect(screen.getByText("pt-2: Missing category")).toBeInTheDocument();
  });

  it("omits the batch error block when there is no batchError", () => {
    renderWithProviders(
      <ImportedTransactionSelectionToolbar {...baseProps()} />
    );
    expect(screen.queryByText(/Missing category/)).not.toBeInTheDocument();
  });
});
