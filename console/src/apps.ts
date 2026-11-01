/**
 * The registry: every native app of this build, by slug. The only module that imports
 * the apps (an ESLint rule keeps the rest of the core out of `apps/`), as
 * `console.main` is on the backend.
 */
import type { AppManifest } from "@console/lib/manifest";
import { manifest as betaTesters } from "@apps/beta-testers/manifest";
import { manifest as health } from "@apps/health/manifest";
import { manifest as moderation } from "@apps/moderation/manifest";
import { manifest as overview } from "@apps/overview/manifest";
import { manifest as worklog } from "@apps/worklog/manifest";

export const APPS: Record<string, AppManifest> = Object.fromEntries(
  [betaTesters, health, moderation, overview, worklog].map((m) => [m.slug, m])
);

/** The app called `slug`, if this build draws it. */
export function appFor(slug: string): AppManifest | undefined {
  return APPS[slug];
}
