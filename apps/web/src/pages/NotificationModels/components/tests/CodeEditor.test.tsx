import { EditorView } from "@codemirror/view";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CodeEditor } from "../CodeEditor";

function viewOf(container: HTMLElement) {
  return EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement)!;
}

describe("CodeEditor", () => {
  it("renders the controlled value and follows prop changes without calling onChange", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<CodeEditor value="print(1)" onChange={onChange} />);
    expect(viewOf(container).state.doc.toString()).toBe("print(1)");

    rerender(<CodeEditor value="print(2)" onChange={onChange} />);
    expect(viewOf(container).state.doc.toString()).toBe("print(2)");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports user edits through onChange", () => {
    const onChange = vi.fn();
    const { container } = render(<CodeEditor value="a" onChange={onChange} />);
    act(() => viewOf(container).dispatch({ changes: { from: 1, insert: "b" } }));
    expect(onChange).toHaveBeenCalledWith("ab");
  });

  it("is not editable when readOnly", () => {
    const { container } = render(<CodeEditor value="a" readOnly />);
    expect(container.querySelector(".cm-content")).toHaveAttribute("contenteditable", "false");
  });

  it("marks error lines", () => {
    const { container } = render(<CodeEditor value={"a\nb\nc"} errorLines={[2, 9]} />);
    const marked = container.querySelectorAll(".cm-error-line");
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent("b");
  });
});
