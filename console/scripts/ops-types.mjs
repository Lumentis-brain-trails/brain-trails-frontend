/**
 * Generate src/lib/ops-types.ts from bt-ops's committed OpenAPI schema.
 *
 * The backend commits `docs/api/ops-openapi.json` and fails its CI when it drifts from
 * the console service; this turns it into TypeScript. Source, in order: `OPENAPI_SRC`
 * (a path or URL), then the sibling checkout
 * `../../brain-trails-backend/docs/api/ops-openapi.json`. Commit the result: the backend
 * repository is private, so CI cannot regenerate it.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sibling = path.resolve(
  here,
  "../../brain-trails-backend/docs/api/ops-openapi.json"
);
const source = process.env.OPENAPI_SRC ?? sibling;

if (!source.startsWith("http") && !existsSync(source)) {
  console.error(`OpenAPI schema not found at ${source}; set OPENAPI_SRC.`);
  process.exit(1);
}

execFileSync(
  path.resolve(here, "../node_modules/.bin/openapi-typescript"),
  [source, "-o", path.join(here, "src/lib/ops-types.ts")],
  { stdio: "inherit" }
);
