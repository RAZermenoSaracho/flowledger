import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { notificationRulesSchema, type NotificationRules } from "@flowledger/shared";

import { HttpError } from "../../../utils/httpError.js";
import type { SandboxRequest, SandboxResult, ScriptValidationError } from "./types.js";

const SANDBOX_DIR = path.dirname(fileURLToPath(import.meta.url));
const CHILD_ENTRY = path.join(SANDBOX_DIR, "sandboxChild.mjs");
const PYODIDE_DIR = realpathSync(
  path.dirname(createRequire(import.meta.url).resolve("pyodide/package.json")),
);

const TOTAL_LIFETIME_MS = 15_000;
const SCRIPT_TIME_MS = 2_000;
const MAX_STDOUT_BYTES = 64 * 1024;
const MAX_PLAYGROUND = 2;

/**
 * Node flags every sandbox child runs with: the permission model with read-only access to the
 * Pyodide package and this directory (denies fs writes, child_process, workers, addons),
 * a 128 MB V8 heap, and a 4096-page (256 MB) cap on wasm linear memory.
 *
 * Memory mechanism: `--wasm-max-mem-pages` (verified on Node 24: allocation beyond the cap raises
 * Python `MemoryError`, which the prelude reports as `resource_limit`). No RSS sampling is needed.
 * Note `--allow-fs-read` must be repeated per path (comma lists only honour the first path).
 */
export const SANDBOX_NODE_FLAGS: readonly string[] = [
  "--permission",
  `--allow-fs-read=${PYODIDE_DIR}/*`,
  `--allow-fs-read=${SANDBOX_DIR}/*`,
  "--max-old-space-size=128",
  "--wasm-max-mem-pages=4096",
];

/**
 * Spawns the Node binary with the sandbox flags, an empty environment, no shell and piped stdio.
 * `entryArgs` is what follows the flags (script path and its arguments).
 */
export function spawnSandboxNode(entryArgs: string[]): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [...SANDBOX_NODE_FLAGS, ...entryArgs], {
    env: {},
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

const limitError = (message: "timeout" | "resource_limit"): SandboxResult => ({
  kind: "error",
  error: { message },
  stdout: "",
});

/**
 * Runs one sandbox child for `request` and resolves with its single JSON response line.
 * Kills (SIGKILL) map to `{kind:"error", error:{message:"timeout"|"resource_limit"}}`:
 * 15 s total lifetime, 2 s of script time after the ready line, stdout over 64 KB.
 * Rejects with an `AbortError` DOMException when `signal` aborts (the child is killed first).
 */
function execChild(request: SandboxRequest, signal?: AbortSignal): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const child = spawnSandboxNode([CHILD_ENTRY, PYODIDE_DIR]);
    let buffer = "";
    let bytes = 0;
    let ready = false;
    let settled = false;
    let scriptTimer: NodeJS.Timeout | undefined;

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(totalTimer);
      clearTimeout(scriptTimer);
      signal?.removeEventListener("abort", onAbort);
      child.kill("SIGKILL");
      fn();
    };
    const limit = (message: "timeout" | "resource_limit"): void =>
      finish(() => resolve(limitError(message) as unknown as Record<string, unknown>));
    const onAbort = (): void => finish(() => reject(new DOMException("Aborted", "AbortError")));

    const totalTimer = setTimeout(() => limit("timeout"), TOTAL_LIFETIME_MS);
    signal?.addEventListener("abort", onAbort, { once: true });

    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.on("error", (err) => finish(() => reject(err)));
    child.on("close", () =>
      finish(() =>
        resolve({ kind: "error", error: { message: ready ? "resource_limit" : "sandbox_failed" }, stdout: "" }),
      ),
    );
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_STDOUT_BYTES) return limit("resource_limit");
      buffer += chunk.toString("utf8");
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!ready) {
          ready = true;
          scriptTimer = setTimeout(() => limit("timeout"), SCRIPT_TIME_MS);
          child.stdin.write(JSON.stringify(request) + "\n");
        } else {
          try {
            const parsed = JSON.parse(line) as Record<string, unknown>;
            finish(() => resolve(parsed));
          } catch {
            finish(() => resolve({ kind: "error", error: { message: "invalid result" }, stdout: "" }));
          }
          return;
        }
      }
    });
  });
}

/**
 * Executes a user script against `request.text` in a fresh, locked-down child process.
 * Rejects only on abort (`AbortError`) or spawn failure; script problems come back as
 * `{kind:"error"}` results.
 */
export async function runScript(
  request: Omit<Extract<SandboxRequest, { mode: "run" }>, "mode">,
  options: { signal?: AbortSignal } = {},
): Promise<SandboxResult> {
  return (await execChild({ mode: "run", ...request }, options.signal)) as unknown as SandboxResult;
}

/**
 * Statically validates `code` (AST allowlist) inside the sandbox. Returns `[]` when valid.
 * A script that kills the validator (timeout/resource limit) is reported as invalid.
 */
export async function validateScript(code: string, options: { signal?: AbortSignal } = {}): Promise<ScriptValidationError[]> {
  const res = await execChild({ mode: "validate", code }, options.signal);
  if (Array.isArray(res.errors)) return res.errors as ScriptValidationError[];
  const message = (res.error as { message?: string } | undefined)?.message ?? "validation failed";
  return [{ line: 1, col: 0, message: `validation failed: ${message}` }];
}

/** Outcome of `parseRules`: the visual rules, the constructs the visual editor cannot represent, or code validation errors. */
export type ParseRulesResult =
  | { rules: NotificationRules }
  | { unsupported: { line: number; message: string }[] }
  | { errors: ScriptValidationError[] };

/**
 * Maps canonical visual-rules code to rules JSON in the sandbox (`ast` only, nothing is executed).
 * The sandbox output is re-checked with `notificationRulesSchema`; a mismatch is reported as unsupported
 * rather than returning rules that could differ from the code. Takes the user's playground slot; throws a 503 `HttpError` when busy.
 */
export async function parseRules(code: string, userId: string, options: { signal?: AbortSignal } = {}): Promise<ParseRulesResult> {
  const release = acquirePlaygroundSlot(userId);
  if (!release) throw new HttpError(503, "Test playground is busy, try again shortly");
  let res: Record<string, unknown>;
  try {
    res = await execChild({ mode: "parse", code }, options.signal);
  } finally {
    release();
  }
  if (Array.isArray(res.errors)) return { errors: res.errors as ScriptValidationError[] };
  if (Array.isArray(res.unsupported)) return { unsupported: res.unsupported as { line: number; message: string }[] };
  if (res.rules) {
    const checked = notificationRulesSchema.safeParse(res.rules);
    if (checked.success) return { rules: checked.data };
    const issue = checked.error.issues[0];
    return { unsupported: [{ line: 1, message: `script does not fit the visual editor: ${issue?.path.join(".")} ${issue?.message}` }] };
  }
  const message = (res.error as { message?: string } | undefined)?.message ?? "parse failed";
  return { errors: [{ line: 1, col: 0, message: `parse failed: ${message}` }] };
}

const slotsByUser = new Map<string, number>();
let slotsTotal = 0;

/**
 * Reserves one in-process playground slot (cap 2 total, 1 per user).
 * Returns a release function (idempotent), or `null` when busy so the caller can answer 503.
 */
export function acquirePlaygroundSlot(userId: string): (() => void) | null {
  if (slotsTotal >= MAX_PLAYGROUND || (slotsByUser.get(userId) ?? 0) >= 1) return null;
  slotsTotal += 1;
  slotsByUser.set(userId, 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    slotsTotal -= 1;
    slotsByUser.delete(userId);
  };
}
