import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    mockReset: true,
    include: ["src/**/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/tests/**",
        "src/**/*.types.ts",
        "src/types/**",
        "src/constants/**",
        "src/index.ts"
      ],
      thresholds: {
        "src/schemas/**": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        }
      }
    }
  }
});
