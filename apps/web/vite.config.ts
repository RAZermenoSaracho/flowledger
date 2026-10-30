import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/** Forbids embedding the SPA (notably the consent page) in any frame. */
const frameHeaders = {
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY"
};

export default defineConfig(({ mode }) => {
  const rootEnvDir = path.resolve(__dirname, "../..");
  const env = loadEnv(mode, rootEnvDir, "");

  return {
    envDir: rootEnvDir,
    plugins: [react()],
    preview: { headers: frameHeaders },
    server: {
      headers: frameHeaders,
      host: "0.0.0.0",
      port: Number(env.WEB_PORT ?? 5173),
      allowedHosts: ["flowledger.razs.dev", "flowledger-dev.razs.dev"]
    }
  };
});
