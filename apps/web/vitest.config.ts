import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    mockReset: true,
    setupFiles: ["src/tests/setup.ts"],
    include: ["src/**/tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/tests/**",
        "src/**/*.types.ts",
        "src/**/types/**",
        "src/main.tsx",
        "src/polyfills.ts",
        "src/constants/**",
        "src/vite-env.d.ts"
      ],
      thresholds: {
        "src/**/utils/**": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        "src/**/hooks/**": {
          statements: 85,
          branches: 85,
          functions: 85,
          lines: 85
        }
      }
    }
  }
});
