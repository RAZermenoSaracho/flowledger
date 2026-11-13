import { describe, expect, it } from "vitest";

import { acquirePlaygroundSlot, runScript, spawnSandboxNode, validateScript } from "../runScript.js";

const ctx = { received_at: "2026-01-02T03:04:05Z", settings: {} };
const run = (code: string, text = "") => runScript({ code, text, ctx });

const PLATA = `
def process(text, ctx):
    if "promo" in normalize(text):
        return skip("promotion")
    m = re.search(r"compra por (\\$[\\d,.]+) en (.+)", text, re.I)
    if not m:
        return None
    return expense(amount=amount(m.group(1)), name=m.group(2).strip(), account="card", currency="MXN")
`;

function probe(script: string): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawnSandboxNode(["-e", script]);
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d));
    child.stderr.on("data", (d: Buffer) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

describe("sandbox runScript (real child process)", () => {
  it("denies fs writes, child_process and worker threads inside the child", async () => {
    const { out } = await probe(`
      const r = {};
      const t = (k, f) => { try { f(); r[k] = "allowed"; } catch (e) { r[k] = e.code; } };
      t("write", () => require("fs").writeFileSync("/tmp/sandbox-probe.txt", "x"));
      t("spawn", () => require("child_process").execSync("echo hi"));
      t("worker", () => new (require("worker_threads").Worker)("1", { eval: true }));
      t("readOutside", () => require("fs").readFileSync("/etc/hosts"));
      console.log(JSON.stringify(r));
    `);
    expect(JSON.parse(out.trim().split("\n").pop()!)).toEqual({
      write: "ERR_ACCESS_DENIED",
      spawn: "ERR_ACCESS_DENIED",
      worker: "ERR_ACCESS_DENIED",
      readOutside: "ERR_ACCESS_DENIED",
    });
  }, 30_000);

  it("starts the child with an empty environment", async () => {
    const { out } = await probe("console.log(JSON.stringify(Object.keys(process.env)))");
    // macOS injects __CF_USER_TEXT_ENCODING into every process regardless of `env`.
    expect(JSON.parse(out.trim()).filter((k: string) => k !== "__CF_USER_TEXT_ENCODING")).toEqual([]);
  }, 30_000);

  it("loads Pyodide under --permission and returns the Plata proposal", async () => {
    const r = await run(PLATA, "Plata: compra por $1,234.50 en OXXO");
    expect(r).toMatchObject({
      kind: "proposal",
      proposal: { kind: "expense", amount: "1234.50", currency: "MXN", name: "OXXO", account: "card" },
    });
  }, 30_000);

  it("skips a promotion, and None with reason 'no result'", async () => {
    expect(await run(PLATA, "PROMO 50% de descuento")).toMatchObject({ kind: "skip", reason: "promotion" });
    expect(await run(PLATA, "hola")).toMatchObject({ kind: "skip", reason: "no result" });
  }, 30_000);

  it("reports a raised exception with its line", async () => {
    const r = await run("def process(text, ctx):\n    x = 1\n    raise ValueError('boom')\n");
    expect(r).toMatchObject({ kind: "error", error: { message: "ValueError: boom", line: 3 } });
  }, 30_000);

  it("rejects float amounts and non-helper returns as invalid result", async () => {
    expect(await run("def process(t, c):\n    return expense(amount=12.5, name='x')")).toMatchObject({
      kind: "error",
      error: { message: "invalid result" },
    });
    expect(await run("def process(t, c):\n    return {'kind': 'expense'}")).toMatchObject({
      kind: "error",
      error: { message: "invalid result" },
    });
  }, 30_000);

  it("captures print output", async () => {
    const r = await run("def process(t, c):\n    print('hi', 1)\n    return None");
    expect(r.stdout).toBe("hi 1\n");
  }, 30_000);

  it.each([
    "import os",
    "x = __import__('os')",
    "x = ().__class__",
    "def f(g):\n    return g.gi_frame",
    'x = "{0.__class__}".format(1)',
    "class A: pass",
    "x = re.enum",
    "x = open('/etc/passwd')",
    "x = getattr(1, 'real')",
  ])("rejects %j", async (code) => {
    const hit = (await validateScript(code)).length > 0;
    if (code.includes("re.enum") || code.includes("open(") || code.includes("getattr(")) {
      // `re.enum` is only a name-level hazard (no leading underscore); the restricted namespace
      // and builtins must make these fail at run time instead.
      const r = await run(`${code}\ndef process(t, c):\n    return None`);
      expect(hit || r.kind === "error").toBe(true);
      expect(r.kind).toBe("error");
    } else {
      expect(hit).toBe(true);
    }
  }, 30_000);

  it("reports line and column for a violation", async () => {
    expect(await validateScript("x = 1\nimport os")).toEqual([
      { line: 2, col: 0, message: "import is not allowed" },
    ]);
    expect(await validateScript("def process(t, c):\n    return None")).toEqual([]);
  }, 30_000);

  it("rejects code over 20,000 characters", async () => {
    const errs = await validateScript("x = 1\n".repeat(4000));
    expect(errs[0]?.message).toMatch(/exceeds/);
  }, 30_000);

  it("kills an infinite loop with timeout", async () => {
    const r = await run("def process(t, c):\n    while True:\n        pass");
    expect(r).toMatchObject({ kind: "error", error: { message: "timeout" } });
  }, 30_000);

  it("kills a ReDoS with timeout", async () => {
    const r = await run('def process(t, c):\n    return re.search(r"(a+)+$", "a" * 40 + "b")');
    expect(r).toMatchObject({ kind: "error", error: { message: "timeout" } });
  }, 30_000);

  it("reports a memory bomb as resource_limit", async () => {
    const r = await run('def process(t, c):\n    x = "a" * 10**9\n    return None');
    expect(r).toMatchObject({ kind: "error", error: { message: "resource_limit" } });
  }, 30_000);

  it("shares no globals between concurrent runs", async () => {
    const [a, b] = await Promise.all([
      run("LEAK = 'a'\ndef process(t, c):\n    return skip(LEAK)"),
      run("def process(t, c):\n    return skip('LEAK' in dir() and 'leak' or 'clean')"),
    ]);
    expect(a).toMatchObject({ kind: "skip", reason: "a" });
    expect(b.kind === "error" || (b.kind === "skip" && b.reason === "clean")).toBe(true);
    const c = await run("def process(t, c):\n    return skip(str(LEAK))");
    expect(c).toMatchObject({ kind: "error" });
  }, 60_000);

  it("kills the child and rejects with AbortError on abort", async () => {
    const ac = new AbortController();
    const p = runScript({ code: "def process(t, c):\n    return None", text: "", ctx }, { signal: ac.signal });
    setTimeout(() => ac.abort(), 300);
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  }, 30_000);
});

describe("acquirePlaygroundSlot", () => {
  it("caps at 2 total and 1 per user, and releases", () => {
    const a = acquirePlaygroundSlot("u1")!;
    expect(acquirePlaygroundSlot("u1")).toBeNull();
    const b = acquirePlaygroundSlot("u2")!;
    expect(acquirePlaygroundSlot("u3")).toBeNull();
    a();
    a();
    const c = acquirePlaygroundSlot("u3");
    expect(c).not.toBeNull();
    b();
    c!();
  });
});
