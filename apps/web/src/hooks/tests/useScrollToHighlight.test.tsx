import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScrollToHighlight } from "../useScrollToHighlight";

describe("useScrollToHighlight", () => {
  const scrollIntoView = vi.fn();
  let target: HTMLElement;

  beforeEach(() => {
    scrollIntoView.mockClear();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    target = document.createElement("div");
    target.id = "debt-1";
    target.scrollIntoView = scrollIntoView;
    document.body.appendChild(target);
  });

  afterEach(() => {
    target.remove();
    vi.restoreAllMocks();
  });

  it("scrolls the target to the centre once loaded", () => {
    renderHook(() => useScrollToHighlight("debt-1", false));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
  });

  it("does not scroll while loading", () => {
    renderHook(() => useScrollToHighlight("debt-1", true));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("does not scroll without a target", () => {
    renderHook(() => useScrollToHighlight(null, false));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("tolerates a missing element", () => {
    expect(() => renderHook(() => useScrollToHighlight("missing", false))).not.toThrow();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls again when rerunKey changes", () => {
    const { rerender } = renderHook(
      ({ key }) => useScrollToHighlight("debt-1", false, key),
      { initialProps: { key: "balances" } }
    );
    rerender({ key: "settled" });
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});
