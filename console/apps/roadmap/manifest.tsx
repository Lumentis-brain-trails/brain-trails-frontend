import type { AppManifest } from "@console/lib/manifest";
import { RoadmapApp } from "./RoadmapApp";
import { NextMilestoneWidget } from "./widgets";

/** Product roadmap as this build draws it, with its editor; the backend is at 1.1.0 too. */
export const manifest: AppManifest = {
  slug: "roadmap",
  version: "1.1.0",
  dataApi: "ops/v1",
  Page: RoadmapApp,
  widgets: {
    next_milestone: (payload) => <NextMilestoneWidget payload={payload} />,
  },
};
