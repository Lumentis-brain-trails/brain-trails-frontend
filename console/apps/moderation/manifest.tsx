import type { AppManifest } from "@console/lib/manifest";
import { ModerationApp } from "./ModerationApp";
import { ReviewQueueWidget } from "./widgets";

/** Moderation as this build draws it; the backend's manifest is version 1.0.0 too. */
export const manifest: AppManifest = {
  slug: "moderation",
  version: "1.0.0",
  dataApi: "ops/v1",
  Page: ModerationApp,
  widgets: {
    review_queue: (payload) => <ReviewQueueWidget payload={payload} />,
  },
};
