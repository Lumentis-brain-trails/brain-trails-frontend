import type { AppManifest } from "@console/lib/manifest";
import { StatisticsApp } from "./StatisticsApp";
import { ActiveWeekWidget, SessionsWeekWidget, SignupsWidget } from "./widgets";

/** Statistics as this build draws it; the backend's manifest is version 1.0.0 too. */
export const manifest: AppManifest = {
  slug: "statistics",
  version: "1.0.0",
  dataApi: "ops/v1",
  Page: StatisticsApp,
  widgets: {
    signups_14d: (payload) => <SignupsWidget payload={payload} />,
    sessions_week: (payload) => <SessionsWeekWidget payload={payload} />,
    active_week: (payload) => <ActiveWeekWidget payload={payload} />,
  },
};
