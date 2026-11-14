import { indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { Annotation, Compartment, EditorState, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, keymap } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";

const externalChange = Annotation.define<boolean>();

const slate = (step: number) => `rgb(var(--slate-${step}))`;

function chromeTheme(dark: boolean) {
  return EditorView.theme(
    {
      "&": { backgroundColor: slate(dark ? 900 : 50), color: slate(dark ? 100 : 900) },
      ".cm-content": { caretColor: slate(dark ? 100 : 900) },
      "&.cm-focused .cm-cursor": { borderLeftColor: slate(dark ? 100 : 900) },
      ".cm-gutters": { backgroundColor: slate(dark ? 800 : 100), color: slate(dark ? 400 : 500), border: "none" },
      ".cm-activeLine": { backgroundColor: dark ? "rgba(148, 163, 184, 0.08)" : "rgba(100, 116, 139, 0.08)" },
      ".cm-activeLineGutter": { backgroundColor: slate(dark ? 700 : 200) },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: dark ? "rgba(96, 165, 250, 0.35)" : "rgba(59, 130, 246, 0.25)"
      }
    },
    { dark }
  );
}

function highlightStyle(c: { keyword: string; string: string; number: string; comment: string; fn: string; type: string }) {
  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: [t.keyword, t.operatorKeyword, t.modifier], color: c.keyword },
      { tag: [t.string, t.special(t.string)], color: c.string },
      { tag: [t.number, t.bool, t.null, t.atom], color: c.number },
      { tag: [t.comment, t.lineComment], color: c.comment, fontStyle: "italic" },
      { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.variableName)], color: c.fn },
      { tag: [t.className, t.typeName, t.self], color: c.type }
    ])
  );
}

const themeExtensions = {
  dark: [
    chromeTheme(true),
    highlightStyle({ keyword: "#c4a1ff", string: "#9fd8a0", number: "#f0b27a", comment: "#8b98a9", fn: "#7cc4ff", type: "#f2d675" })
  ],
  light: [
    chromeTheme(false),
    highlightStyle({ keyword: "#7c3aed", string: "#15803d", number: "#b45309", comment: "#64748b", fn: "#1d4ed8", type: "#a16207" })
  ]
};

function isDarkApp() {
  return document.documentElement.classList.contains("dark");
}

const editorTheme = EditorView.theme({
  "&": { fontSize: "14px", maxHeight: "28rem" },
  ".cm-scroller": { overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  ".cm-content": { minHeight: "12rem" },
  ".cm-error-line": { backgroundColor: "rgba(220, 38, 38, 0.18)" }
});

function readOnlyExtensions(readOnly: boolean) {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

function errorLineExtension(lines: number[]) {
  return EditorView.decorations.compute([], (state) => {
    const builder = new RangeSetBuilder<Decoration>();
    for (const line of [...new Set(lines)].sort((a, b) => a - b)) {
      if (line >= 1 && line <= state.doc.lines) {
        builder.add(state.doc.line(line).from, state.doc.line(line).from, Decoration.line({ class: "cm-error-line" }));
      }
    }
    return builder.finish();
  });
}

/**
 * Python source editor (CodeMirror 6 with `lang-python`; no workers or eval, so it runs under the app CSP).
 * Controlled: `value` is the source of truth and `onChange` fires only for user edits. `errorLines` are
 * 1-based line numbers highlighted as errors; `readOnly` blocks edits but keeps selection and copy.
 * `label` is the editor's accessible name.
 */
export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  errorLines = [],
  label = "Script code"
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  errorLines?: number[];
  label?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const readOnlyCompartment = useRef(new Compartment());
  const errorsCompartment = useRef(new Compartment());
  const themeCompartment = useRef(new Compartment());
  const initial = useRef({ value, readOnly, errorLines, label });

  useEffect(() => {
    const start = initial.current;
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: start.value,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          indentUnit.of("    "),
          python(),
          themeCompartment.current.of(themeExtensions[isDarkApp() ? "dark" : "light"]),
          editorTheme,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": start.label }),
          readOnlyCompartment.current.of(readOnlyExtensions(start.readOnly)),
          errorsCompartment.current.of(errorLineExtension(start.errorLines)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((tr) => tr.annotation(externalChange))) {
              onChangeRef.current?.(update.state.doc.toString());
            }
          })
        ]
      })
    });
    viewRef.current = view;
    const observer = new MutationObserver(() =>
      view.dispatch({ effects: themeCompartment.current.reconfigure(themeExtensions[isDarkApp() ? "dark" : "light"]) })
    );
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        annotations: externalChange.of(true)
      });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: readOnlyCompartment.current.reconfigure(readOnlyExtensions(readOnly)) });
  }, [readOnly]);

  const errorKey = errorLines.join(",");
  useEffect(() => {
    viewRef.current?.dispatch({ effects: errorsCompartment.current.reconfigure(errorLineExtension(errorLines)) });
    // errorKey is the serialized errorLines; depending on the array itself would re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorKey]);

  return (
    <div>
      <div ref={hostRef} className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700" />
      {!readOnly && <p className="mt-1 text-xs text-slate-500">Tab indents. Press Esc then Tab to leave the editor.</p>}
    </div>
  );
}
