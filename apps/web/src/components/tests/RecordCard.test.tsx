import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../tests/utils/renderWithProviders";
import { RecordCard, type RecordCardAction } from "../RecordCard";

// jsdom never computes real layout, so `getBoundingClientRect()` always
// reports a width of 0 — RecordCard's inline-vs-menu measurement therefore
// always resolves to "menu" here, regardless of action count/length. That
// matches production behavior on a narrow/zero-width card, so these tests
// exercise the three-dot-menu path exclusively.

describe("RecordCard", () => {
  it("renders leading, title, subtitle, and trailing content", () => {
    renderWithProviders(
      <RecordCard
        leading={<span data-testid="leading" />}
        title={<span>Groceries</span>}
        subtitle={<span>Jan 15</span>}
        trailing={<span>$42.50</span>}
      />
    );

    expect(screen.getByTestId("leading")).toBeInTheDocument();
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("Jan 15")).toBeInTheDocument();
    expect(screen.getByText("$42.50")).toBeInTheDocument();
  });

  it("renders no action menu when no actions are given", () => {
    renderWithProviders(<RecordCard title="Groceries" />);
    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
  });

  it("exposes actions behind a three-dot menu, using the default 'Actions' label", async () => {
    const onEdit = vi.fn();
    const actions: RecordCardAction[] = [{ key: "edit", label: "Edit", onClick: onEdit }];
    const user = userEvent.setup();

    renderWithProviders(<RecordCard title="Groceries" actions={actions} />);

    const trigger = screen.getByRole("button", { name: "Actions" });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("uses a custom actionsLabel when provided", () => {
    const actions: RecordCardAction[] = [{ key: "edit", label: "Edit", onClick: vi.fn() }];
    renderWithProviders(
      <RecordCard title="Groceries" actions={actions} actionsLabel="Transaction actions" />
    );

    expect(screen.getByRole("button", { name: "Transaction actions" })).toBeInTheDocument();
  });

  it("marks a danger-variant action as a danger menu item", async () => {
    const actions: RecordCardAction[] = [
      { key: "delete", label: "Delete", onClick: vi.fn(), variant: "danger" }
    ];
    const user = userEvent.setup();
    renderWithProviders(<RecordCard title="Groceries" actions={actions} />);

    await user.click(screen.getByRole("button", { name: "Actions" }));

    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveClass("text-coral");
  });

  it("disables a disabled action's menu item", async () => {
    const actions: RecordCardAction[] = [
      { key: "edit", label: "Edit", onClick: vi.fn(), disabled: true }
    ];
    const user = userEvent.setup();
    renderWithProviders(<RecordCard title="Groceries" actions={actions} />);

    await user.click(screen.getByRole("button", { name: "Actions" }));

    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeDisabled();
  });

  it("renders children below the main row", () => {
    renderWithProviders(
      <RecordCard title="Groceries">
        <div data-testid="extra-content" />
      </RecordCard>
    );

    expect(screen.getByTestId("extra-content")).toBeInTheDocument();
  });

  it("applies id and highlightClassName to the outer card", () => {
    const { container } = renderWithProviders(
      <RecordCard id="row-1" title="Groceries" highlightClassName="border-coral" />
    );

    const card = container.querySelector("#row-1");
    expect(card).toHaveClass("border-coral");
  });
});
