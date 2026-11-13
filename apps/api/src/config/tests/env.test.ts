import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env.ts loads the workspace .env on import; a developer's real .env must not leak into these cases.
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));

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
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) delete process.env[key];
  }
  if (!("PUBLIC_API_URL" in extra)) delete process.env.PUBLIC_API_URL;
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

describe("env SYNCFY_AUTO_SYNC_ENABLED", () => {
  it.each([
    ["true", true],
    ["TRUE", true],
    [" 1 ", true],
    ["false", false],
    ["False", false],
    ["0", false],
    ["", false],
    [undefined, false]
  ])("parses %j as %s", async (value, expected) => {
    const env = await loadEnv({ SYNCFY_AUTO_SYNC_ENABLED: value });
    expect(env.SYNCFY_AUTO_SYNC_ENABLED).toBe(expected);
  });

  it("fails startup on an unrecognised value", async () => {
    await expect(loadEnv({ SYNCFY_AUTO_SYNC_ENABLED: "yes" })).rejects.toThrow(/SYNCFY_AUTO_SYNC_ENABLED/);
  });
});

describe("env startup checks", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const key of ["SYNCFY_API_KEY", "SYNCFY_WEBHOOK_SIGNATURE_KEY"]) {
      delete process.env[key];
    }
    process.env.NODE_ENV = "test";
  });

  beforeEach(() => {
    delete process.env.SYNCFY_AUTO_SYNC_ENABLED;
  });

  it("fails naming the variable, with no value, when the Syncfy key has no signing key", async () => {
    const attempt = loadEnv({
      SYNCFY_API_KEY: "secret-api-key",
      SYNCFY_WEBHOOK_SIGNATURE_KEY: undefined
    });

    await expect(attempt).rejects.toThrow(/SYNCFY_WEBHOOK_SIGNATURE_KEY/);
    const message = await attempt.catch((error: Error) => error.message);
    expect(message).not.toContain("secret-api-key");
  });

  it("accepts the Syncfy key with a signing key", async () => {
    const env = await loadEnv({
      SYNCFY_API_KEY: "key",
      SYNCFY_WEBHOOK_SIGNATURE_KEY: "signing-key"
    });

    expect(env.SYNCFY_WEBHOOK_SIGNATURE_KEY).toBe("signing-key");
  });

  it("fails on a short JWT_SECRET in production only", async () => {
    await expect(loadEnv({ NODE_ENV: "production", JWT_SECRET: "a".repeat(31) })).rejects.toThrow(
      /JWT_SECRET/
    );

    const env = await loadEnv({ NODE_ENV: "production", JWT_SECRET: "a".repeat(32) });
    expect(env.NODE_ENV).toBe("production");
  });

  it("starts over HTTPS outside production", async () => {
    const env = await loadEnv({ NODE_ENV: "development", WEB_APP_URL: "https://staging.example.com" });

    expect(env.WEB_APP_URL).toBe("https://staging.example.com");
  });
});

describe("env notification processor limits", () => {
  const G = "NOTIFICATION_PROCESSOR_MAX_CONCURRENT_GLOBAL";
  const U = "NOTIFICATION_PROCESSOR_MAX_CONCURRENT_PER_USER";

  afterEach(() => {
    delete process.env[G];
    delete process.env[U];
  });

  it("defaults to 4 global and 2 per user", async () => {
    const env = await loadEnv({ [G]: undefined, [U]: undefined });
    expect(env[G]).toBe(4);
    expect(env[U]).toBe(2);
  });

  it.each([
    [G, "2.5"],
    [G, "0"],
    [G, "65"],
    [U, "abc"],
    [U, "0"],
    [U, "65"]
  ])("rejects %s=%s naming the variable", async (name, value) => {
    await expect(loadEnv({ [name]: value })).rejects.toThrow(new RegExp(name));
  });

  it("rejects a per-user limit above the global limit, naming both", async () => {
    await expect(loadEnv({ [G]: "2", [U]: "3" })).rejects.toThrow(/PER_USER[\s\S]*GLOBAL/);
  });
});
