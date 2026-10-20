import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import i18next from "eslint-plugin-i18next";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Every app of the console, one directory each under `apps/`. */
const APPS = readdirSync(path.join(here, "apps"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

/**
 * An app never imports another app, only the console's core (`@console/*`) and the
 * product's shared primitives (`@/*`) - the backend's import-linter rule, here. Working on
 * an app means working in its two directories (backend plan OPS, "Layering").
 */
const appBoundaries = APPS.map((app) => ({
  files: [`apps/${app}/**/*.{ts,tsx}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: APPS.filter((other) => other !== app).flatMap((other) => [
          {
            group: [`@apps/${other}`, `@apps/${other}/*`],
            message: "An app imports the console core, never another app.",
          },
          {
            group: [`../${other}`, `../${other}/*`],
            message: "An app imports the console core, never another app.",
          },
        ]),
      },
    ],
  },
}));

/** The core never reaches into an app; only `src/apps.ts` (the registry) knows them. */
const coreBoundary = {
  files: ["src/**/*.{ts,tsx}"],
  ignores: ["src/apps.ts", "src/**/*.test.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          { group: ["@apps/*"], message: "Only src/apps.ts knows the apps." },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Everything a person can read comes from messages/*.json, never inline.
    files: [
      "src/app/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
      "apps/**/*.{ts,tsx}",
    ],
    ignores: ["src/app/api/**", "**/*.test.{ts,tsx}", "apps/**/lib/**"],
    ...i18next.configs["flat/recommended"],
  },
  ...appBoundaries,
  coreBoundary,
  globalIgnores([
    ".next/**",
    "out/**",
    "next-env.d.ts",
    "src/lib/ops-types.ts",
  ]),
]);

export default eslintConfig;
