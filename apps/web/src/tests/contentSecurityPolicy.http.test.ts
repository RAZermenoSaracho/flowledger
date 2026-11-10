// @vitest-environment node
import { cp, mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { preview, type PreviewServer } from "vite";

const webRoot = process.cwd();
let server: PreviewServer;
let outDir: string;

function directives(policy: string) {
  return new Map(
    policy.split(";").map((part) => {
      const [name, ...sources] = part.trim().split(/\s+/);
      return [name, sources] as const;
    })
  );
}

beforeAll(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), "flowledger-csp-"));
  await cp(path.join(webRoot, "index.html"), path.join(outDir, "index.html"));
  server = await preview({
    configFile: path.join(webRoot, "vite.config.ts"),
    root: webRoot,
    logLevel: "silent",
    build: { outDir },
    preview: { host: "127.0.0.1", port: 0 }
  });
});

afterAll(async () => {
  await server.close();
  await rm(outDir, { recursive: true, force: true });
});

describe("application CSP from the preview server", () => {
  it("enforces a policy that forbids inline script, eval, plugins and framing", async () => {
    const { port } = server.httpServer.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/login`);
    const policy = response.headers.get("content-security-policy") ?? "";
    const csp = directives(policy);

    expect(csp.get("script-src")).toEqual([
      "'self'",
      "https://www.paybook.com",
      "https://www.googletagmanager.com",
      "https://static.cloudflareinsights.com"
    ]);
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.get("connect-src")?.[1]).toMatch(/^https?:\/\/[^/]+$/);
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });
});
