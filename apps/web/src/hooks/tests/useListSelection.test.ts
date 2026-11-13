import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useListSelection } from "../useListSelection";

function setup() {
  return renderHook(
    (p: { resetKey: string; windowKey: string }) => useListSelection({ ...p, total: 120, canSelectAllMatching: true }),
    { initialProps: { resetKey: "q", windowKey: "0:50" } }
  );
}

describe("useListSelection", () => {
  it("selects a window and toggles rows", () => {
    const { result } = setup();
    act(() => result.current.setWindow(["a", "b"], true));
    expect(result.current.count).toBe(2);
    act(() => result.current.toggle("a"));
    expect(result.current.isSelected("a")).toBe(false);
    expect(result.current.toRequest()).toEqual({ mode: "ids", ids: ["b"] });
  });

  it("selects all matching and falls back to window minus row on toggle", () => {
    const { result } = setup();
    act(() => result.current.selectAllMatching());
    expect(result.current.count).toBe(120);
    expect(result.current.toRequest()).toEqual({ mode: "all" });
    act(() => result.current.toggle("b", ["a", "b", "c"]));
    expect(result.current.allMatching).toBe(false);
    expect(result.current.toRequest()).toEqual({ mode: "ids", ids: ["a", "c"] });
  });

  it("clears ids but keeps allMatching on a window change", () => {
    const { result, rerender } = setup();
    act(() => result.current.setWindow(["a"], true));
    rerender({ resetKey: "q", windowKey: "50:50" });
    expect(result.current.count).toBe(0);
    act(() => result.current.selectAllMatching());
    rerender({ resetKey: "q", windowKey: "100:50" });
    expect(result.current.allMatching).toBe(true);
  });

  it("clears everything on reset and on clear()", () => {
    const { result, rerender } = setup();
    act(() => result.current.selectAllMatching());
    rerender({ resetKey: "q2", windowKey: "0:50" });
    expect(result.current.allMatching).toBe(false);
    act(() => result.current.setWindow(["a"], true));
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });
});
