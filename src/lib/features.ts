/**
 * Feature flags as the backend reports them (`GET /config`, plan V3 deploy table).
 *
 * Every half-built surface of V3 is hidden behind a flag until its dependencies are live
 * in that environment. The frontend never decides a flag's state: it asks the backend,
 * so one environment variable on the API turns a feature on for both halves at once.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";

export type AppConfig = components["schemas"]["ConfigOut"];

/** The flag names the backend declares, as a type. */
export type FeatureName = keyof AppConfig["features"] & string;

export const CONFIG_QUERY_KEY = ["config"] as const;

/** Environment, version and flags; cached for the session (they change on deploy). */
export function useAppConfig() {
  return useQuery({
    queryKey: CONFIG_QUERY_KEY,
    queryFn: () => api.get<AppConfig>("config"),
    staleTime: Infinity,
  });
}

/**
 * Whether a flag is on. `false` while loading or when the request failed: an unknown
 * state must hide an unfinished feature, never show it.
 */
export function useFeature(name: FeatureName): boolean {
  const config = useAppConfig();
  return config.data?.features[name] === true;
}
