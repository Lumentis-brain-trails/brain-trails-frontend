/**
 * A native app as the console's frontend knows it (backend OPS-0003). Its data side -
 * scopes, panels, the widgets it exports, its version and changelog - lives in the
 * backend's `console/apps/<slug>/manifest.py` and reaches the shell through the index;
 * this side binds the same slug and version to what draws it.
 */
import type { ComponentType, ReactNode } from "react";

/** What an app's page gets: the version the index says is open. */
export interface AppPageProps {
  semver: string;
}

/** Draws one exported widget from its snapshot's payload. */
export type WidgetRenderer = (payload: Record<string, unknown>) => ReactNode;

export interface AppManifest {
  slug: string;
  /** The version this build of the frontend draws; the backend registers the same one. */
  version: string;
  dataApi: "ops/v1";
  Page: ComponentType<AppPageProps>;
  /** By widget id, as the backend manifest exports them. */
  widgets: Record<string, WidgetRenderer>;
}
