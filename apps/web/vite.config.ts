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

export default defineConfig(({ mode }) => {
  const rootEnvDir = path.resolve(__dirname, "../..");
  const env = loadEnv(mode, rootEnvDir, "");

  return {
    envDir: rootEnvDir,
    plugins: [react(), missingIconsReturn404()],
    preview: { headers: frameHeaders },
    server: {
      headers: frameHeaders,
      host: "0.0.0.0",
      port: Number(env.WEB_PORT ?? 5173),
      allowedHosts: ["flowledger.razs.dev", "flowledger-dev.razs.dev"]
    }
  };
});
