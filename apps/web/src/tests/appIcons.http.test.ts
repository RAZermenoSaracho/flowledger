// @vitest-environment node
import { cp, mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, preview, type PreviewServer, type ViteDevServer } from "vite";

const webRoot = process.cwd();
const configFile = path.join(webRoot, "vite.config.ts");

const servedIcons = [
  ["/favicon.ico", "image/x-icon"],
  ["/favicon.svg", "image/svg+xml"],
  ["/apple-touch-icon.png", "image/png"],
  ["/apple-touch-icon-240x240.png", "image/png"],
  ["/icon-192.png", "image/png"],
  ["/icon-512.png", "image/png"],
  ["/icon-maskable-512.png", "image/png"],
  ["/manifest.webmanifest", "application/manifest+json"]
];
const missingIcons = [
  "/apple-touch-icon-precomposed.png",
  "/apple-touch-icon-120x120.png",
  "/apple-touch-icon-240x240-precomposed.png"
];

function describeIconHttp(
  mode: string,
  start: () => Promise<{ port: number; stop: () => Promise<void> }>
) {
  describe(`app icon responses from the ${mode} server`, () => {
    let server: { port: number; stop: () => Promise<void> };
    const get = (pathname: string) =>
      fetch(`http://127.0.0.1:${server.port}${pathname}`, {
        headers: { accept: "*/*" }
      });

    beforeAll(async () => {
      server = await start();
    });
    afterAll(() => server.stop());

    it.each(servedIcons)("serves %s as %s", async (pathname, contentType) => {
      const response = await get(pathname);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(contentType);
    });

    it.each(missingIcons)("answers missing %s with 404, not the app shell", async (pathname) => {
      const response = await get(pathname);

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type") ?? "").not.toContain("text/html");
    });

    it("still serves the app shell, with icon declarations, for client routes", async () => {
      const response = await get("/login");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(await response.text()).toContain('href="/apple-touch-icon-240x240.png"');
    });
  });
}

function portOf(address: AddressInfo | string | null | undefined) {
  return (address as AddressInfo).port;
}

describeIconHttp("dev", async () => {
  const server: ViteDevServer = await createServer({
    configFile,
    root: webRoot,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: null }
  });
  await server.listen();
  return { port: portOf(server.httpServer?.address()), stop: () => server.close() };
});

describeIconHttp("preview", async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), "flowledger-icons-"));
  await cp(path.join(webRoot, "public"), outDir, { recursive: true });
  await cp(path.join(webRoot, "index.html"), path.join(outDir, "index.html"));
  const server: PreviewServer = await preview({
    configFile,
    root: webRoot,
    logLevel: "silent",
    build: { outDir },
    preview: { host: "127.0.0.1", port: 0 }
  });

  return {
    port: portOf(server.httpServer.address()),
    stop: async () => {
      await server.close();
      await rm(outDir, { recursive: true, force: true });
    }
  };
});
