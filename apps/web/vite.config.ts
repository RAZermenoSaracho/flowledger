import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

/** Forbids embedding the SPA (notably the consent page) in any frame. */
const frameHeaders = {
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY"
};

/**
 * Answers missing root-level icon requests with 404. Vite's SPA fallback would
 * otherwise return `index.html` with a 200, and iOS probes paths such as
 * `/apple-touch-icon-120x120.png` expecting either an image or an error.
 */
function missingIconsReturn404(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const pathname = req.url?.split("?")[0] ?? "";
    const isIconPath = /^\/[\w-]+\.(png|ico)$/.test(pathname);

    if (isIconPath && !existsSync(path.join(__dirname, "public", pathname))) {
      res.statusCode = 404;
      res.end();
      return;
    }

    next();
  };

  return {
    name: "missing-icons-return-404",
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler)
  };
}

/**
 * Enforced CSP for the built app. Scripts are first-party except the two hosts the Syncfy widget
 * injects scripts from and the Cloudflare Web Analytics beacon the edge injects, with no inline
 * script or eval. Requests and images stay broad: the
 * widget's socket host comes from the Syncfy API at runtime, and neither directive controls script
 * execution.
 */
function appContentSecurityPolicy(apiOrigin: string) {
  return [
    "default-src 'self'",
    "script-src 'self' https://www.paybook.com https://www.googletagmanager.com https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${apiOrigin} https: wss:`,
    `img-src 'self' ${apiOrigin} https: data: blob:`,
    "font-src 'self' data:",
    "frame-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join("; ");
}

export default defineConfig(({ mode }) => {
  const rootEnvDir = path.resolve(__dirname, "../..");
  const env = loadEnv(mode, rootEnvDir, "");
  const apiOrigin = new URL(env.VITE_API_URL || "http://localhost:4000").origin;

  return {
    envDir: rootEnvDir,
    plugins: [react(), missingIconsReturn404()],
    preview: {
      headers: {
        ...frameHeaders,
        "Content-Security-Policy": appContentSecurityPolicy(apiOrigin)
      }
    },
    server: {
      headers: frameHeaders,
      host: "127.0.0.1",
      port: Number(env.WEB_PORT ?? 5173),
      allowedHosts: ["flowledger.razs.dev", "flowledger-dev.razs.dev"]
    }
  };
});
