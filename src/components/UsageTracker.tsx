"use client";

import { useParams, usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  flush,
  isTrackedRoute,
  routePattern,
  startUsage,
  track,
} from "@/lib/usage";

/**
 * Turns the usage log on for the surface that mounts it (`@/lib/usage`): one
 * `page.viewed` per route visited, named by its pattern, and a flush of the
 * previous page's events on every route change. Rendering nothing, it sits in
 * the signed-in layouts and nowhere else: the participant's run is skipped by
 * route, and a future client shell that does not mount it records nothing.
 */
export function UsageTracker() {
  const pathname = usePathname();
  const params = useParams();
  const route = routePattern(pathname, params);
  const tracked = isTrackedRoute(route);
  // the path last counted: StrictMode's double-invoked effects count it once
  const viewed = useRef<string | null>(null);

  useEffect(() => {
    if (!tracked) return;
    return startUsage();
  }, [tracked]);

  useEffect(() => {
    if (!tracked) {
      viewed.current = null;
      return;
    }
    if (viewed.current === pathname) return;
    viewed.current = pathname;
    flush("navigate");
    track("page.viewed", { route });
  }, [pathname, route, tracked]);

  return null;
}
