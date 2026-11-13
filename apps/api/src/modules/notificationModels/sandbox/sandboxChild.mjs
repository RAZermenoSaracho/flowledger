// Sandbox child: runs inside `node --permission` (fs-read only). Protocol: prints
// {"ready":true}, reads ONE JSON request line on stdin, writes ONE JSON response line, exits.
import { readFileSync, constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const here = path.dirname(fileURLToPath(import.meta.url));
const pyodideDir = process.argv[2];
// Under --permission `process.binding` always throws, but Pyodide's Emscripten NODEFS init only
// reads `process.binding("constants").fs`; serve that from the public fs.constants (grants no capability).
process.binding = (name) => {
  if (name === "constants") return { fs: fsConstants };
  throw new Error(`process.binding(${name}) is not available`);
};
const { loadPyodide } = await import(path.join(pyodideDir, "pyodide.mjs"));

const pyodide = await loadPyodide({ indexURL: pyodideDir, packageCacheDir: pyodideDir, fullStdLib: false });
delete globalThis.fetch;
delete globalThis.WebSocket;

pyodide.runPython(readFileSync(path.join(here, "prelude.py"), "utf8"));
const run = pyodide.globals.get("run");
const validate = pyodide.globals.get("validate");
pyodide.runPython(`
import sys
for _m in ("js", "pyodide", "pyodide_js", "_pyodide", "pyodide_js._api"):
    sys.modules.pop(_m, None)
del sys, _m
`);

process.stdout.write('{"ready":true}\n');

const rl = createInterface({ input: process.stdin });
rl.once("line", (line) => {
  let out;
  try {
    const req = JSON.parse(line);
    if (req.mode === "validate") {
      out = { errors: validate(req.code).toJs({ dict_converter: Object.fromEntries }) };
    } else {
      const ctx = pyodide.toPy(req.ctx ?? {});
      out = run(req.code, String(req.text ?? ""), ctx).toJs({ dict_converter: Object.fromEntries });
    }
  } catch (e) {
    out = { kind: "error", error: { message: `sandbox: ${e?.message ?? e}` }, stdout: "" };
  }
  process.stdout.write(JSON.stringify(out) + "\n", () => process.exit(0));
});
