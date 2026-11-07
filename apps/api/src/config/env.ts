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
  dotenv.config({
    path: path.join(workspaceRoot, ".env"),
    override: process.env.NODE_ENV === "production"
  });
} else {
  dotenv.config({ override: process.env.NODE_ENV === "production" });
}

/** Parses a boolean env flag: `true`/`1` enable; `false`/`0`/empty/unset disable (case-insensitive, trimmed); anything else fails validation. */
const envFlag = z
  .string()
  .default("")
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.enum(["true", "1", "false", "0", ""], { message: "must be one of true, 1, false, 0, or empty" }))
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRES_IN_DAYS: z.coerce.number().int().positive().default(30),
  REFRESH_TOKEN_COOKIE_DOMAIN: z.string().min(1).optional(),
  API_PORT: z.coerce.number().int().positive().default(4000),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().url(),
  WEB_APP_URL: z.string().url(),
  PUBLIC_API_URL: z.string().url().optional(),
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
  SYNCFY_AUTO_SYNC_ENABLED: envFlag,
  SYNCFY_AUTO_SYNC_INTERVAL_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  SYNCFY_AUTO_SYNC_JOB_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(120000),
  SYNCFY_AUTO_SYNC_CONCURRENCY: z.coerce.number().int().positive().default(1),
  SYNCFY_TRANSACTION_LOOKBACK_DAYS: z.coerce.number().int().positive().default(60),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
}).superRefine((input, context) => {
  if (input.SYNCFY_API_KEY && !input.SYNCFY_WEBHOOK_SIGNATURE_KEY) {
    context.addIssue({
      code: "custom",
      path: ["SYNCFY_WEBHOOK_SIGNATURE_KEY"],
      message: "is required when SYNCFY_API_KEY is set"
    });
  }

  if (input.NODE_ENV === "production" && input.JWT_SECRET.length < 32) {
    context.addIssue({
      code: "custom",
      path: ["JWT_SECRET"],
      message: "must be at least 32 characters in production"
    });
  }
});

/** Validated process environment; throws at startup if required vars are missing or malformed. */
export const env = (() => {
  const parsed = envSchema.parse(process.env);
  return {
    ...parsed,
    PUBLIC_API_URL: parsed.PUBLIC_API_URL ?? `http://localhost:${parsed.API_PORT}`
  };
})();
