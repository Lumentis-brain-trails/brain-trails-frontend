import type { AppManifest } from "@console/lib/manifest";
import { DocumentsApp } from "./DocumentsApp";
import { DraftsWidget } from "./widgets";

/**
 * Documents as this build draws it (backend OPS-0005): every report, draft, brief and
 * analysis written for the team, in Markdown, versioned. The backend's manifest is
 * version 1.0.0 too, with one widget: the drafts still being written.
 */
export const manifest: AppManifest = {
  slug: "documents",
  version: "1.0.0",
  dataApi: "ops/v1",
  Page: DocumentsApp,
  widgets: {
    drafts: (payload) => <DraftsWidget payload={payload} />,
  },
};
