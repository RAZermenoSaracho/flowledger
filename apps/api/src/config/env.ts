import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

function findWorkspaceRoot(startDir: string): string | undefined {
  let currentDir = path.resolve(startDir);

  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");

    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        workspaces?: unknown;
      };

      if (packageJson.workspaces) {
        return currentDir;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }

    currentDir = parentDir;
  }
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot =
  findWorkspaceRoot(process.cwd()) ?? findWorkspaceRoot(moduleDir);

if (workspaceRoot) {
  dotenv.config({ path: path.join(workspaceRoot, ".env") });
} else {
  dotenv.config();
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().url(),
  WEB_APP_URL: z.string().url(),
  SYNCFY_API_KEY: z.string().min(1).optional(),
  SYNCFY_WEBHOOK_SIGNATURE_KEY: z.string().min(1).optional(),
  SYNCFY_API_BASE_URL: z.string().url().default("https://api.syncfy.com"),
  SYNCFY_DATA_BASE_URL: z.string().url().default("https://sync.paybook.com"),
  PROVIDER_WEBHOOK_PUBLIC_BASE_URL: z.string().url().optional(),
  SYNCFY_WIDGET_SCRIPT_URL: z
    .string()
    .url()
    .default("https://cdn.skypack.dev/@paybook/sync-widget"),
  SYNCFY_WIDGET_STYLE_URL: z
    .string()
    .url()
    .default("https://cdn.jsdelivr.net/npm/@paybook/sync-widget/dist/widget.css"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});

export const env = envSchema.parse(process.env);
