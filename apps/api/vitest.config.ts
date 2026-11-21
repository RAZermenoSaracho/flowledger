import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // config/env.ts skips dotenv under Vitest, so tests never read a developer .env and run in fresh worktrees; these are fake values for the required variables.
    env: {
      DATABASE_URL: "postgresql://test:test@127.0.0.1:1/flowledger_test",
      JWT_SECRET: "test-only-jwt-secret-not-a-real-secret-0123456789",
      GOOGLE_CLIENT_ID: "test-google-client-id",
      GOOGLE_CLIENT_SECRET: "test-google-client-secret",
      GOOGLE_CALLBACK_URL: "http://localhost:4000/auth/google/callback",
      WEB_APP_URL: "http://localhost:5173",
      TWELVE_DATA_API_KEY: ""
    },
    mockReset: true,
    setupFiles: ["src/tests/helpers/loopback.setup.ts"],
    // docker-test-vm has 2 vCPUs; default parallelism drives its load to ~30 and trips 5s test / 10s hook timeouts.
    maxWorkers: 2,
    include: ["src/**/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/tests/**",
        "src/**/*.types.ts",
        "src/**/types/**",
        "src/server.ts",
        "src/worker.ts",
        "src/app.ts",
        "src/config/env.ts"
      ],
      thresholds: {
        "src/modules/**/utils/**": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        "src/utils/**": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        "src/modules/**/services/**": {
          statements: 85,
          branches: 85,
          functions: 85,
          lines: 85
        }
      }
    }
  }
});
