import { afterEach, describe, expect, it, vi } from "vitest";

const base = {
  DATABASE_URL: "postgresql://x",
  JWT_SECRET: "a".repeat(16),
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  GOOGLE_CALLBACK_URL: "http://localhost:4000/cb",
  WEB_APP_URL: "http://localhost:5173",
  API_PORT: "4321"
};

async function loadEnv(extra: Record<string, string | undefined>) {
  vi.resetModules();
  Object.assign(process.env, base, extra);
  if (extra.PUBLIC_API_URL === undefined) delete process.env.PUBLIC_API_URL;
  return (await import("../env.js")).env;
}

describe("env PUBLIC_API_URL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to localhost on API_PORT", async () => {
    const env = await loadEnv({});
    expect(env.PUBLIC_API_URL).toBe("http://localhost:4321");
  });

  it("honours a custom URL", async () => {
    const env = await loadEnv({ PUBLIC_API_URL: "https://api.example.com" });
    expect(env.PUBLIC_API_URL).toBe("https://api.example.com");
  });
});
