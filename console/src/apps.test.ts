import { describe, expect, test } from "vitest";
import { APPS, appFor } from "./apps";

/**
 * The frontend's native apps match the backend's manifests (console/apps/<slug>/
 * manifest.py): the same slugs, versions and exported widgets. A change on one side
 * without the other fails here.
 */
const BACKEND = {
  "beta-testers": { version: "1.0.0", widgets: ["pending_applications"] },
  health: { version: "0.1.0", widgets: ["failed_jobs", "restarts_24h"] },
  moderation: { version: "1.0.0", widgets: ["review_queue"] },
  overview: { version: "1.0.0", widgets: ["recordings_14d"] },
  worklog: { version: "1.0.0", widgets: ["tokens_week", "work_week"] },
};

describe("the app registry", () => {
  test("the frontend draws exactly the backend's apps, at the same versions", () => {
    expect(Object.keys(APPS).sort()).toEqual(Object.keys(BACKEND));
    for (const [slug, expected] of Object.entries(BACKEND)) {
      const manifest = appFor(slug)!;
      expect(manifest.version).toBe(expected.version);
      expect(manifest.dataApi).toBe("ops/v1");
      expect(Object.keys(manifest.widgets).sort()).toEqual(expected.widgets);
    }
    expect(appFor("nothing")).toBeUndefined();
  });
});
