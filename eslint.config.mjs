import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import i18next from "eslint-plugin-i18next";

/**
 * Surfaces built from sprint S13 on (plan V3): user-visible text there must come from
 * `messages/*.json` through next-intl, never be written inline. Add every new
 * directory here when it is created; older pages move in as they are rewritten.
 */
const TRANSLATED_SURFACES = [
  "src/app/(app)/run/**",
  "src/app/(app)/my/**",
  "src/app/(app)/console/**",
  "src/app/(app)/experiments/**",
  "src/components/run/**",
  "src/components/console/**",
  "src/components/experiments/**",
  "src/components/application/**",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: TRANSLATED_SURFACES.map((glob) => `${glob}/*.{ts,tsx}`),
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
    // Playwright's reports and traces.
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
