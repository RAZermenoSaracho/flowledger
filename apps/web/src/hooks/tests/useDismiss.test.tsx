import { fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useDismiss } from "../useDismiss";

function Harness({
  onDismiss,
  enabled = true
}: {
  onDismiss: () => void;
  enabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onDismiss, enabled);
  return (
    <div>
      <div ref={ref} data-testid="inside" />
      <div data-testid="outside" />
    </div>
  );
}

describe("useDismiss", () => {
  it("dismisses on a pointer press outside", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Harness onDismiss={onDismiss} />);
    fireEvent.pointerDown(getByTestId("outside"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses on Escape", () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("ignores a press inside and other keys", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Harness onDismiss={onDismiss} />);
    fireEvent.pointerDown(getByTestId("inside"));
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("does nothing while disabled", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Harness onDismiss={onDismiss} enabled={false} />);
    fireEvent.pointerDown(getByTestId("outside"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("calls the latest callback after a re-render", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, getByTestId } = render(<Harness onDismiss={first} />);
    rerender(<Harness onDismiss={second} />);
    fireEvent.pointerDown(getByTestId("outside"));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
