import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const rootEnvDir = path.resolve(__dirname, "../..");
  const env = loadEnv(mode, rootEnvDir, "");

  return {
    envDir: rootEnvDir,
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: Number(env.WEB_PORT ?? 5173),
      allowedHosts: ["flowledger.razs.dev", "flowledger-dev.razs.dev"]
    }
  };
});
