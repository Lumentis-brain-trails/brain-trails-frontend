/**
 * The workspaces the signed-in user belongs to (backend V3-0001, sprint S14).
 *
 * Everything the backend stores belongs to a workspace; every list call names the one it
 * wants with `?workspace=`. Until practices and labs arrive (S22) an account has exactly
 * one - its personal workspace - so there is no switcher yet: the first workspace the
 * API returns (personal first) is the current one.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";

export type Workspace = components["schemas"]["WorkspaceOut"];

export const WORKSPACES_QUERY_KEY = ["workspaces"] as const;

/** The caller's workspaces, personal first; cached for the session. */
export function useWorkspaces() {
  return useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: () => api.get<Workspace[]>("workspaces"),
    staleTime: 5 * 60_000,
  });
}

/** The workspace lists are scoped to, or undefined while it loads. */
export function useCurrentWorkspace(): Workspace | undefined {
  return useWorkspaces().data?.[0];
}

/**
 * `path` with `workspace=<id>` added to its query string, or `path` unchanged while the
 * workspace is still loading (callers gate their query on it with `enabled`).
 */
export function inWorkspace(
  path: string,
  workspace: Pick<Workspace, "id"> | undefined
): string {
  if (workspace === undefined) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}workspace=${encodeURIComponent(workspace.id)}`;
}
