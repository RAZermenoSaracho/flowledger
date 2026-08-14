import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "database/prisma/migrations/**"
    ]
  },
  {
    languageOptions: {
      globals: {
        console: "readonly",
        document: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        process: "readonly",
        React: "readonly",
        URL: "readonly"
      }
    }
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ]
    }
  },
  {
    // Scoped to the two classic hook-correctness rules only — the plugin's
    // "recommended" preset bundles newer React-Compiler-era rules (e.g.
    // set-state-in-effect) that don't apply to this React 18 codebase.
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn"
    }
  },
  prettier
);
