import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import i18next from "eslint-plugin-i18next";

/**
 * Where user-visible text must come from `messages/*.json` through next-intl, never be
 * written inline: everything a person can open. An inline word here is a word that
 * stays English for an Italian reader.
 */
const TRANSLATED_SURFACES = ["src/app/**", "src/components/**"];

/** Not screens: the BFF routes speak JSON to the client, and tests quote the copy. */
const UNTRANSLATED = ["src/app/api/**", "**/*.test.{ts,tsx}"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: TRANSLATED_SURFACES.map((glob) => `${glob}/*.{ts,tsx}`),
    ignores: UNTRANSLATED,
    ...i18next.configs["flat/recommended"],
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated from the backend's OpenAPI schema (npm run api:types).
    "src/lib/api-types.ts",
    // The console is its own app with its own lint config (console/eslint.config.mjs).
    "console/**",
    // Playwright's reports and traces.
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
