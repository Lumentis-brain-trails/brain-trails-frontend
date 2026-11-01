import type { AppManifest } from "@console/lib/manifest";
import { OverviewApp, RecordingsWidget } from "./OverviewApp";

/** Overview as this build draws it; the backend's manifest is version 1.0.0 too. */
export const manifest: AppManifest = {
  slug: "overview",
  version: "1.0.0",
  dataApi: "ops/v1",
  Page: OverviewApp,
  widgets: {
    recordings_14d: (payload) => <RecordingsWidget payload={payload} />,
  },
};
