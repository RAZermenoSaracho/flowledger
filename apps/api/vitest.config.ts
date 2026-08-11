import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
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
