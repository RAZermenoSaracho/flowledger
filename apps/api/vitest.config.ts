import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Keeps a developer .env key from ever reaching the live provider; dotenv never overrides an existing variable.
    env: { TWELVE_DATA_API_KEY: "" },
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
