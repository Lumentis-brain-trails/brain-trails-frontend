import type { AppManifest } from "@console/lib/manifest";
import { PipelineLabApp } from "./PipelineLabApp";

/**
 * The Pipeline lab as this build draws it (backend OPS-0006): experiments on one
 * environment's stored EEG embeddings, so it follows the switch. The backend's manifest
 * is version 1.0.0 too, with no widget.
 */
export const manifest: AppManifest = {
  slug: "pipeline-lab",
  version: "1.0.0",
  dataApi: "ops/v1",
  followsEnv: true,
  Page: PipelineLabApp,
  widgets: {},
};
