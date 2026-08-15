import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../tests/utils/renderWithProviders";
import { RecordCard, type RecordCardAction } from "../RecordCard";

// jsdom never computes real layout, so `getBoundingClientRect()` always
// reports a width of 0 — RecordCard's inline-vs-menu measurement therefore
// always resolves to "menu" here, regardless of action count/length, unless
// a test explicitly stubs the measurements (see the "inline-vs-menu width
// threshold" describe block below). That default matches production
// behavior on a narrow/zero-width card, so the tests above exercise the
// three-dot-menu path exclusively.

/**
 * A `ResizeObserver` stand-in that stores whatever callback it's constructed
 * with instead of ever calling it (jsdom's own layout is always 0x0, so a
 * real observer notification never carries useful data anyway) — tests
 * trigger a re-measurement explicitly via the returned `notify()` once
 * they've set up real measurements on the observed elements.
 */
function installControllableResizeObserver() {
  let callback: ResizeObserverCallback | null = null;
  class ControllableResizeObserver {
    constructor(cb: ResizeObserverCallback) {
      callback = cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ControllableResizeObserver);
  return {
    notify: () => callback?.([] as unknown as ResizeObserverEntry[], {} as ResizeObserver)
  };
}

/**
 * Sets `getBoundingClientRect().width` on the card element and `scrollWidth`
 * on the actions probe (found via its `invisible` class) as own instance
 * properties — takes precedence over any prototype-level jsdom default,
 * unlike a `vi.spyOn`/`Object.defineProperty` on the shared prototype.
 */
function setCardMeasurements(
  container: HTMLElement,
  { cardWidth, actionsWidth }: { cardWidth: number; actionsWidth: number }
) {
  const card = container.firstElementChild as HTMLElement;
  const probe = container.querySelector(".invisible") as HTMLElement;
  card.getBoundingClientRect = () => ({ width: cardWidth }) as DOMRect;
  Object.defineProperty(probe, "scrollWidth", {
    configurable: true,
    value: actionsWidth
  });
}

/**
 * RecordCard toggles inline-vs-menu via Tailwind's `hidden`/`flex` classes,
 * not conditional rendering — both the inline actions row and the menu
 * trigger are always structurally present. Vitest's jsdom environment
 * doesn't apply the real compiled stylesheet, so `display: none` never
 * actually takes effect; asserting on DOM presence would pass regardless of
 * which branch is active. Assert on the class tokens themselves instead.
 */
function expectInlineActionsVisible(visible: boolean) {
  const inlineContainer = screen.getByRole("button", { name: "Edit" }).parentElement!;
  const menuContainer = screen.getByRole("button", { name: "Actions" }).parentElement!;
  if (visible) {
    expect(inlineContainer).toHaveClass("flex");
    expect(inlineContainer).not.toHaveClass("hidden");
    expect(menuContainer).toHaveClass("hidden");
  } else {
    expect(inlineContainer).toHaveClass("hidden");
    expect(menuContainer).not.toHaveClass("hidden");
  }
}

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

  describe("inline-vs-menu width threshold", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("renders actions inline when they're well under 40% of the card's width", () => {
      const resizeObserver = installControllableResizeObserver();
      const actions: RecordCardAction[] = [{ key: "edit", label: "Edit", onClick: vi.fn() }];
      const { container } = renderWithProviders(
        <RecordCard title="Groceries" actions={actions} />
      );

      setCardMeasurements(container, { cardWidth: 400, actionsWidth: 100 });
      act(() => resizeObserver.notify());

      expectInlineActionsVisible(true);
    });

    it("collapses into the three-dot menu when actions exceed 40% of the card's width", () => {
      const resizeObserver = installControllableResizeObserver();
      const actions: RecordCardAction[] = [{ key: "edit", label: "Edit", onClick: vi.fn() }];
      const { container } = renderWithProviders(
        <RecordCard title="Groceries" actions={actions} />
      );

      setCardMeasurements(container, { cardWidth: 400, actionsWidth: 250 });
      act(() => resizeObserver.notify());

      expectInlineActionsVisible(false);
    });

    it("collapses into the menu when actions are exactly 40% of the card's width", () => {
      const resizeObserver = installControllableResizeObserver();
      const actions: RecordCardAction[] = [{ key: "edit", label: "Edit", onClick: vi.fn() }];
      const { container } = renderWithProviders(
        <RecordCard title="Groceries" actions={actions} />
      );

      setCardMeasurements(container, { cardWidth: 400, actionsWidth: 160 });
      act(() => resizeObserver.notify());

      expectInlineActionsVisible(false);
    });

    it("stays inline one pixel under the 40% threshold", () => {
      const resizeObserver = installControllableResizeObserver();
      const actions: RecordCardAction[] = [{ key: "edit", label: "Edit", onClick: vi.fn() }];
      const { container } = renderWithProviders(
        <RecordCard title="Groceries" actions={actions} />
      );

      setCardMeasurements(container, { cardWidth: 400, actionsWidth: 159 });
      act(() => resizeObserver.notify());

      expectInlineActionsVisible(true);
    });
  });
});
