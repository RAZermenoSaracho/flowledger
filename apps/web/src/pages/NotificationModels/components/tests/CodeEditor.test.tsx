import { EditorView } from "@codemirror/view";
import { act, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CodeEditor } from "../CodeEditor";

function viewOf(container: HTMLElement) {
  return EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement)!;
}

const rect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
const emptyRects = () => [] as unknown as DOMRectList;
const rangeProto = Range.prototype as Partial<Range>;
const saved = { rects: rangeProto.getClientRects, box: rangeProto.getBoundingClientRect };

beforeAll(() => {
  rangeProto.getClientRects = emptyRects;
  rangeProto.getBoundingClientRect = () => rect;
});

afterAll(() => {
  rangeProto.getClientRects = saved.rects;
  rangeProto.getBoundingClientRect = saved.box;
});

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

  describe("theme", () => {
    afterEach(() => document.documentElement.classList.remove("dark"));

    it("follows the app dark class without recreating the view or losing text/selection", async () => {
      const { container } = render(<CodeEditor value="print(1)" />);
      const view = viewOf(container);
      expect(view.state.facet(EditorView.darkTheme)).toBe(false);
      act(() => view.dispatch({ selection: { anchor: 2, head: 5 } }));

      document.documentElement.classList.add("dark");
      await vi.waitFor(() => expect(view.state.facet(EditorView.darkTheme)).toBe(true));
      expect(viewOf(container)).toBe(view);
      expect(view.state.doc.toString()).toBe("print(1)");
      expect(view.state.selection.main).toMatchObject({ anchor: 2, head: 5 });

      document.documentElement.classList.remove("dark");
      await vi.waitFor(() => expect(view.state.facet(EditorView.darkTheme)).toBe(false));
    });

    it("starts dark when the app is already dark", () => {
      document.documentElement.classList.add("dark");
      const { container } = render(<CodeEditor value="a" />);
      expect(viewOf(container).state.facet(EditorView.darkTheme)).toBe(true);
    });
  });

  describe("keyboard", () => {
    function setup(value: string, anchor: number, head = anchor) {
      const { container } = render(<CodeEditor value={value} />);
      const view = viewOf(container);
      view.focus();
      act(() => view.dispatch({ selection: { anchor, head } }));
      return view;
    }

    it("Tab inserts four spaces and undo restores", async () => {
      const view = setup("x", 0);
      await userEvent.keyboard("{Tab}");
      expect(view.state.doc.toString()).toBe("    x");
      await userEvent.keyboard("{Control>}z{/Control}");
      expect(view.state.doc.toString()).toBe("x");
    });

    it("Tab indents every selected line and Shift+Tab unindents", async () => {
      const view = setup("a\nb", 0, 3);
      await userEvent.keyboard("{Tab}");
      expect(view.state.doc.toString()).toBe("    a\n    b");
      await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
      expect(view.state.doc.toString()).toBe("a\nb");
    });

    it("Enter after a def line indents the next line", async () => {
      const text = "def process(text, ctx):";
      const view = setup(text, text.length);
      await userEvent.keyboard("{Enter}");
      expect(view.state.doc.toString()).toBe(`${text}\n    `);
    });

    it("Escape then Tab leaves the editor (Tab no longer indents)", async () => {
      const view = setup("x", 0);
      const press = (key: string, keyCode: number) =>
        act(() => void view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key, keyCode, bubbles: true, cancelable: true })));
      press("Escape", 27);
      press("Tab", 9);
      expect(view.state.doc.toString()).toBe("x");
    });

    it("shows the focus-escape hint", () => {
      const { getByText } = render(<CodeEditor value="" />);
      expect(getByText(/Esc then Tab/)).toBeInTheDocument();
    });
  });
});
