/**
 * Generate src/lib/api-types.ts from the backend's committed OpenAPI schema.
 *
 * The backend commits `docs/api/openapi.json` and fails its CI when the file drifts
 * from the app (plan V3, "Contracts"); this script turns it into TypeScript so response
 * types stop being written by hand. Source, in order: `OPENAPI_SRC` (a path or URL),
 * then the sibling checkout `../brain-trails-backend/docs/api/openapi.json`.
 *
 * Run `npm run api:types` after pulling a backend change that touches the API, and
 * commit the result: the backend repo is private, so CI cannot regenerate it.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sibling = path.resolve(
  root,
  "../brain-trails-backend/docs/api/openapi.json"
);
const source = process.env.OPENAPI_SRC ?? sibling;

if (!source.startsWith("http") && !existsSync(source)) {
  console.error(`OpenAPI schema not found at ${source}; set OPENAPI_SRC.`);
  process.exit(1);
}

execFileSync(
  path.join(root, "node_modules/.bin/openapi-typescript"),
  [source, "-o", path.join(root, "src/lib/api-types.ts")],
  { stdio: "inherit" }
);
