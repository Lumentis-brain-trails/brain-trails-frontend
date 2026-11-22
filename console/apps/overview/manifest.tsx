import type { AppManifest } from "@console/lib/manifest";
import { OverviewApp, RecordingsWidget } from "./OverviewApp";

/** Overview as this build draws it; deprecated in 1.1.0 (Statistics replaces it). */
export const manifest: AppManifest = {
  slug: "overview",
  version: "1.1.0",
  dataApi: "ops/v1",
  Page: OverviewApp,
  widgets: {
    recordings_14d: (payload) => <RecordingsWidget payload={payload} />,
  },
};
