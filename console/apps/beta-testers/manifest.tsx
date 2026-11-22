import type { AppManifest } from "@console/lib/manifest";
import { BetaTestersApp } from "./BetaTestersApp";
import { PendingWidget } from "./widgets";

/** Beta testers as this build draws it; the backend's manifest is version 1.0.0 too. */
export const manifest: AppManifest = {
  slug: "beta-testers",
  version: "1.0.0",
  dataApi: "ops/v1",
  Page: BetaTestersApp,
  widgets: {
    pending_applications: (payload) => <PendingWidget payload={payload} />,
  },
};
