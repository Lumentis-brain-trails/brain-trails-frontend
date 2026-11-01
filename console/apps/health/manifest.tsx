import type { AppManifest } from "@console/lib/manifest";
import { HealthApp } from "./HealthApp";
import { FailedJobsWidget, RestartsWidget } from "./widgets";

/** Health as this build draws it; the backend's manifest is version 0.1.0 too. */
export const manifest: AppManifest = {
  slug: "health",
  version: "0.1.0",
  dataApi: "ops/v1",
  Page: HealthApp,
  widgets: {
    failed_jobs: (payload) => <FailedJobsWidget payload={payload} />,
    restarts_24h: (payload) => <RestartsWidget payload={payload} />,
  },
};
