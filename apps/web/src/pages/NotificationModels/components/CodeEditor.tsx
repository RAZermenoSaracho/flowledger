import { python } from "@codemirror/lang-python";
import { Annotation, Compartment, EditorState, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";

const externalChange = Annotation.define<boolean>();

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
  const initial = useRef({ value, readOnly, errorLines, label });

  useEffect(() => {
    const start = initial.current;
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: start.value,
        extensions: [
          basicSetup,
          python(),
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
    return () => {
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

  return <div ref={hostRef} className="overflow-hidden rounded-md border border-slate-200 bg-white text-ink dark:border-slate-700" />;
}
