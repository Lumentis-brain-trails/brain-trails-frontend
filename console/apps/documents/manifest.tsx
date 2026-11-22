import type { AppManifest } from "@console/lib/manifest";
import { DocumentsApp } from "./DocumentsApp";

/**
 * Documents as this build draws it (backend OPS-0005): every report, draft, brief and
 * analysis written for the team, in Markdown, versioned. The backend's manifest is
 * version 1.0.0 too; it exports no widget.
 */
export const manifest: AppManifest = {
  slug: "documents",
  version: "1.0.0",
  dataApi: "ops/v1",
  Page: DocumentsApp,
  widgets: {},
};
