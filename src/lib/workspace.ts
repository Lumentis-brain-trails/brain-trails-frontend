/**
 * The workspaces the signed-in user belongs to, and the one they are working in
 * (backend V3-0001; organisations from V4 sprint T2, V4-0001 and V4-0006).
 *
 * Everything the backend stores belongs to a workspace; every list call names the one it
 * wants with `?workspace=`. An account has its personal workspace and, with
 * `workspaces_multi` on, the clinics and laboratories it holds a seat in. The switcher
 * chooses one; the choice is this browser's (localStorage), and anything it no longer
 * names - a seat given up, a request still pending - falls back to the personal one, as
 * does everything while the flag is off.
 *
 * **A tab keeps the workspace it loaded with.** The choice is read once per page load and
 * changed only by `selectWorkspace` in that tab. A switch in another tab reloads this one
 * (`useReloadOnWorkspaceChange`, mounted by the shell) instead of retargeting it in
 * place: a protocol being saved in one tab must never land in another tab's library.
 *
 * The **edition** is the kind of the current workspace: the shell, the navigation and
 * the words are chosen from it, never from a second set of pages.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { type AppConfig, useAppConfig } from "@/lib/features";

export type Workspace = components["schemas"]["WorkspaceOut"];

/** The three faces of one product: today's private app, and the two V4 editions. */
export type Edition = "personal" | "therapy" | "research";

/** A seat in an organisation, highest first (backend `app.organisations.SEATS`). */
export type Seat = "owner" | "admin" | "member";
export const SEATS: readonly Seat[] = ["owner", "admin", "member"];

export const WORKSPACES_QUERY_KEY = ["workspaces"] as const;

/** localStorage key of the chosen workspace id. */
export const SELECTED_WORKSPACE_KEY = "bt-workspace";
const CHANGE_EVENT = "bt-workspace-change";

/** The caller's workspaces, personal first; cached for the session. */
export function useWorkspaces() {
  return useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: () => api.get<Workspace[]>("workspaces"),
    staleTime: 5 * 60_000,
  });
}

/**
 * Whether the caller can work in it: their personal workspace always; an organisation
 * once it is active and they hold a seat there (a request has no seat yet).
 */
export function isUsable(workspace: Workspace): boolean {
  if (workspace.kind === "personal") return true;
  return workspace.status === "active" && workspace.relations.length > 0;
}

/**
 * The workspace to work in: the selected one if it is still usable, else the first
 * usable one the API returned (the personal workspace comes first).
 */
export function pickCurrent(
  workspaces: Workspace[] | undefined,
  selectedId: string | null
): Workspace | undefined {
  if (!Array.isArray(workspaces)) return undefined;
  const usable = workspaces.filter(isUsable);
  return usable.find((w) => w.id === selectedId) ?? usable[0];
}

/** The edition a workspace kind mounts (V4-0006). */
export function editionOf(kind: string | undefined): Edition {
  if (kind === "practice") return "therapy";
  if (kind === "lab") return "research";
  return "personal";
}

/** The caller's seat in an organisation, or null outside one. */
export function seatOf(workspace: Workspace | undefined): Seat | null {
  if (!workspace) return null;
  return SEATS.find((s) => workspace.relations.includes(s)) ?? null;
}

/** Owners and admins manage seats and invitations (backend `can_manage_members`). */
export function managesMembers(workspace: Workspace | undefined): boolean {
  const seat = seatOf(workspace);
  return seat === "owner" || seat === "admin";
}

/** This tab's choice: read from storage once, then changed only here. */
let pinned: { id: string | null } | undefined;

function readStored(): string | null {
  try {
    return window.localStorage.getItem(SELECTED_WORKSPACE_KEY);
  } catch {
    return null; // storage blocked: the personal workspace, every time
  }
}

function readSelected(): string | null {
  pinned ??= { id: readStored() };
  return pinned.id;
}

function subscribeSelected(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/** Choose the workspace to work in, in this browser; every open hook of this tab follows. */
export function selectWorkspace(id: string): void {
  pinned = { id };
  try {
    window.localStorage.setItem(SELECTED_WORKSPACE_KEY, id);
  } catch {
    /* storage blocked: the choice lasts until the page reloads */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Forget this tab's pinned choice (tests; a real tab forgets it by reloading). */
export function resetPinnedWorkspace(): void {
  pinned = undefined;
}

/**
 * Reload this tab when another tab switches workspace. The `storage` event fires only in
 * the *other* tabs, so the tab that switched is untouched (it navigates on its own). A
 * page with unsaved work keeps its `beforeunload` prompt; if the person stays, the tab
 * still works in the workspace it loaded with, never in the new one.
 */
export function useReloadOnWorkspaceChange(): void {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SELECTED_WORKSPACE_KEY && e.newValue !== e.oldValue)
        window.location.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
}

/** The id the switcher last chose, or null (server render, nothing chosen yet). */
export function useSelectedWorkspaceId(): string | null {
  return useSyncExternalStore(subscribeSelected, readSelected, () => null);
}

/**
 * Whether the saved choice applies, from the environment's flags: `true` with
 * `workspaces_multi` on, `false` with it off, `undefined` while `GET /config` has not
 * answered. A failed `/config` keeps the saved choice: losing the flags must not move
 * anyone out of the clinic they are working in.
 */
export function choiceApplies(config: {
  data?: Pick<AppConfig, "features">;
  isError: boolean;
}): boolean | undefined {
  if (config.data?.features)
    return config.data.features.workspaces_multi === true;
  return config.isError ? true : undefined;
}

/**
 * The workspace lists are scoped to and saves go to, or undefined while it is not known
 * yet - the workspaces, or the flags that say whether the saved choice applies. Callers
 * gate reads with `enabled` and writes on it being defined: a save made before the flags
 * answer would land in the personal workspace, the API's default. With
 * `workspaces_multi` off the saved choice is ignored and the personal workspace is the
 * answer, so an environment that turns the flag off cannot leave anyone in a clinic
 * without the switcher to leave it.
 */
export function useCurrentWorkspace(): Workspace | undefined {
  const selected = useSelectedWorkspaceId();
  const applies = choiceApplies(useAppConfig());
  const workspaces = useWorkspaces().data;
  if (applies === undefined) return undefined;
  return pickCurrent(workspaces, applies ? selected : null);
}

/** The current workspace's edition; `personal` while loading. */
export function useEdition(): Edition {
  return editionOf(useCurrentWorkspace()?.kind);
}

/**
 * The flags of the current workspace's kind (`GET /config?workspace=`). Undefined while
 * loading; the environment's flags (`useFeature`) stay the answer for signed-out pages.
 */
export function useWorkspaceConfig() {
  const workspace = useCurrentWorkspace();
  return useQuery({
    queryKey: ["config", workspace?.id],
    queryFn: () => api.get<AppConfig>(inWorkspace("config", workspace)),
    enabled: workspace !== undefined,
    staleTime: Infinity,
  });
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
