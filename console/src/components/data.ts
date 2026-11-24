"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  type AppDetail,
  type AppItem,
  type Me,
  type Pin,
  type Snapshot,
  type StripItem,
  type StripItemIn,
  type WidgetItem,
  OpsRequestError,
  ops,
  opsIn,
} from "@console/lib/client";
import { type EnvId, cacheEnv } from "@console/lib/env";
import { useOps, useOpsEnv } from "@console/components/env";

/**
 * The shell's reads and writes, as react-query hooks. Every read runs once when its
 * screen mounts and again only after a write or a person's refresh: no polling, no
 * refetch on focus (backend decision 0014).
 */

/** Sends a signed-out or half-signed-in person back to the right sign-in step. */
export function useAuthRedirect(error: unknown): void {
  const router = useRouter();
  useEffect(() => {
    if (!(error instanceof OpsRequestError)) return;
    if (error.needsSecondFactor) router.replace("/login/verify");
    else if (error.signedOut) router.replace("/login");
  }, [error, router]);
}

export const useMe = () =>
  useQuery({ queryKey: ["me"], queryFn: () => ops.get<Me>("me") });

export const useApps = () =>
  useQuery({ queryKey: ["apps"], queryFn: () => ops.get<AppItem[]>("apps") });

export const useApp = (slug: string) =>
  useQuery({
    queryKey: ["apps", slug],
    queryFn: () => ops.get<AppDetail>(`apps/${slug}`),
  });

export const usePins = () =>
  useQuery({ queryKey: ["pins"], queryFn: () => ops.get<Pin[]>("pins") });

export const useStrip = () =>
  useQuery({
    queryKey: ["strip"],
    queryFn: () => ops.get<StripItem[]>("widgets/strip"),
  });

export const useWidgets = (enabled: boolean) =>
  useQuery({
    queryKey: ["widgets"],
    queryFn: () => ops.get<WidgetItem[]>("widgets"),
    enabled,
  });

/** Replace the side rail's pins with `slugs`, in order. */
export function useSetPins() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (slugs: string[]) =>
      ops.put<Pin[]>(
        "pins",
        slugs.map((slug) => ({ slug }))
      ),
    onSuccess: (pins) => {
      client.setQueryData(["pins"], pins);
      void client.invalidateQueries({ queryKey: ["apps"] });
    },
  });
}

/** Replace the strip's layout. */
export function useSetLayout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (items: StripItemIn[]) =>
      ops.put<StripItemIn[]>("widgets/layout", { items }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["strip"] }),
  });
}

/** A panel's parameters as one stable string: keys sorted, as the backend hashes them. */
export function paramsKey(params: Record<string, unknown> = {}): string {
  const sorted = Object.fromEntries(
    Object.entries(params)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .sort(([a], [b]) => a.localeCompare(b))
  );
  return JSON.stringify(sorted);
}

/**
 * What a refresh names: a panel as `<app>.<panel>`, its parameters when it takes any,
 * and the environment when it is not the surrounding page's (the strip names each
 * widget's own). Full keys (`<env>/...`) are never sent: their slash would not pass the
 * BFF, and the environment travels in `X-Ops-Env` instead.
 */
export type RefreshTarget =
  | string
  | { key: string; params?: Record<string, unknown>; env?: EnvId | null };

function target(t: RefreshTarget): {
  key: string;
  params: string;
  env: EnvId | null | undefined;
} {
  return typeof t === "string"
    ? { key: t, params: paramsKey(), env: undefined }
    : { key: t.key, params: paramsKey(t.params), env: t.env };
}

/**
 * Run one panel now and store its snapshot: a person's click, the only refresh there is.
 * Inside an app that follows the environment switch it runs on that environment.
 */
export function useRefresh() {
  const client = useQueryClient();
  const api = useOps();
  const { cacheKey, home } = useOpsEnv();
  return useMutation({
    mutationFn: (t: RefreshTarget) => {
      const { key, params, env } = target(t);
      const via = env === undefined ? api : opsIn(env);
      return via.post<Snapshot>(
        `snapshots/${encodeURIComponent(key)}/refresh`,
        {
          params: JSON.parse(params),
        }
      );
    },
    onSuccess: (snapshot, t) => {
      const { key, params, env } = target(t);
      const slot = env === undefined ? cacheKey : cacheEnv(env, home);
      client.setQueryData(["snapshot", slot, key, params], snapshot);
      void client.invalidateQueries({ queryKey: ["strip"] });
    },
  });
}

/**
 * The newest snapshot of a panel for these parameters, in this part of the page's
 * environment; `null` when never taken. The environment is part of the cache key, so
 * switching never shows one environment's numbers under another's header.
 */
export const useSnapshot = (key: string, params?: Record<string, unknown>) => {
  const p = paramsKey(params);
  const api = useOps();
  const { cacheKey } = useOpsEnv();
  return useQuery({
    queryKey: ["snapshot", cacheKey, key, p],
    queryFn: async () => {
      try {
        const q = p === "{}" ? "" : `?params=${encodeURIComponent(p)}`;
        return await api.get<Snapshot>(
          `snapshots/${encodeURIComponent(key)}${q}`
        );
      } catch (e) {
        if (e instanceof OpsRequestError && e.code === "no_snapshot")
          return null;
        throw e;
      }
    },
  });
};
