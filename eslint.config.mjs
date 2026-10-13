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

/**
 * The exceptions, each for a reason: the staff app stays English (plan V3, open
 * decision 6); the privacy note is legal text with its own review; the timing probe is
 * a developer tool that never ships to production.
 */
const UNTRANSLATED = [
  "src/app/(admin)/**",
  "src/app/(public)/privacy/**",
  "src/app/api/**",
  "src/components/TimingProbeOverlay.tsx",
  "**/*.test.{ts,tsx}",
];

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
    // Playwright's reports and traces.
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
