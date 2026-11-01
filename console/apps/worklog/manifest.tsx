import type { AppManifest } from "@console/lib/manifest";
import { WorklogApp } from "./WorklogApp";
import { TokensWeekWidget, WorkWeekWidget } from "./widgets";

/** The work log as this build draws it; the backend's manifest is version 1.0.0 too. */
export const manifest: AppManifest = {
  slug: "worklog",
  version: "1.0.0",
  dataApi: "ops/v1",
  Page: WorklogApp,
  widgets: {
    work_week: (payload) => <WorkWeekWidget payload={payload} />,
    tokens_week: (payload) => <TokensWeekWidget payload={payload} />,
  },
};
