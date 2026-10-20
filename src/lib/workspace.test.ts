import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Workspace,
  editionOf,
  inWorkspace,
  managesMembers,
  SELECTED_WORKSPACE_KEY,
  choiceApplies,
  pickCurrent,
  resetPinnedWorkspace,
  useCurrentWorkspace,
  useReloadOnWorkspaceChange,
  useSelectedWorkspaceId,
  seatOf,
  selectWorkspace,
} from "./workspace";

const responses: Record<string, unknown> = {};
vi.mock("@/lib/api", () => ({
  api: {
    get: async (path: string) => {
      const answer = responses[path];
      return typeof answer === "function" ? answer() : answer;
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  window.localStorage.clear();
  resetPinnedWorkspace();
});
afterEach(() => vi.restoreAllMocks());

function ws(
  id: string,
  kind: string,
  relations: string[],
  status = "active"
): Workspace {
  return {
    id,
    kind,
    relations,
    status,
    slug: id,
    name: id,
    region: "eu",
    created_at: "2026-10-20T00:00:00Z",
  };
}

const PERSONAL = ws("p", "personal", ["data_reader", "owner"]);
const CLINIC = ws("c", "practice", ["member"]);
const PENDING = ws("q", "lab", [], "pending");

describe("pickCurrent", () => {
  it("is the personal workspace when nothing was chosen", () => {
    expect(pickCurrent([PERSONAL, CLINIC], null)).toBe(PERSONAL);
  });

  it("is the chosen one while it is usable", () => {
    expect(pickCurrent([PERSONAL, CLINIC], "c")).toBe(CLINIC);
  });

  it("never lands on a request still waiting for an admin", () => {
    expect(pickCurrent([PERSONAL, PENDING], "q")).toBe(PERSONAL);
  });

  it("falls back when the chosen seat is gone", () => {
    expect(pickCurrent([PERSONAL], "c")).toBe(PERSONAL);
  });

  it("is undefined while the list loads", () => {
    expect(pickCurrent(undefined, "c")).toBeUndefined();
  });
});

describe("editions and seats", () => {
  it("maps each kind to its edition", () => {
    expect(editionOf("practice")).toBe("therapy");
    expect(editionOf("lab")).toBe("research");
    expect(editionOf("personal")).toBe("personal");
    expect(editionOf(undefined)).toBe("personal");
  });

  it("reads the seat and whether it manages members", () => {
    expect(seatOf(CLINIC)).toBe("member");
    expect(managesMembers(CLINIC)).toBe(false);
    expect(seatOf(ws("a", "lab", ["admin", "data_reader"]))).toBe("admin");
    expect(managesMembers(ws("a", "lab", ["admin"]))).toBe(true);
    expect(seatOf(undefined)).toBeNull();
  });
});

describe("inWorkspace", () => {
  it("adds the workspace to a path without a query", () => {
    expect(inWorkspace("recordings", { id: "w1" })).toBe(
      "recordings?workspace=w1"
    );
  });

  it("leaves the path alone while the workspace loads", () => {
    expect(inWorkspace("recordings", undefined)).toBe("recordings");
  });

  it("appends to an existing query string", () => {
    expect(inWorkspace("media?kind=game", { id: "w 2" })).toBe(
      "media?kind=game&workspace=w%202"
    );
  });
});

describe("selectWorkspace", () => {
  it("remembers the choice in this browser and tells the open hooks", () => {
    const heard = vi.fn();
    window.addEventListener("bt-workspace-change", heard);
    selectWorkspace("c");
    window.removeEventListener("bt-workspace-change", heard);
    expect(window.localStorage.getItem(SELECTED_WORKSPACE_KEY)).toBe("c");
    expect(heard).toHaveBeenCalledOnce();
  });
});

describe("a tab keeps the workspace it loaded with", () => {
  it("does not follow a choice another tab wrote", () => {
    window.localStorage.setItem(SELECTED_WORKSPACE_KEY, "c");
    const { result, rerender } = renderHook(() => useSelectedWorkspaceId());
    expect(result.current).toBe("c");
    window.localStorage.setItem(SELECTED_WORKSPACE_KEY, "other");
    rerender();
    expect(result.current).toBe("c");
  });

  it("follows its own switch", () => {
    const { result } = renderHook(() => useSelectedWorkspaceId());
    selectWorkspace("c");
    return waitFor(() => expect(result.current).toBe("c"));
  });

  it("reloads when another tab switches, and not for other keys", () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      reload,
    });
    const { unmount } = renderHook(() => useReloadOnWorkspaceChange());
    window.dispatchEvent(
      new StorageEvent("storage", { key: "bt-theme", newValue: "dark" })
    );
    expect(reload).not.toHaveBeenCalled();
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: SELECTED_WORKSPACE_KEY,
        oldValue: "p",
        newValue: "c",
      })
    );
    expect(reload).toHaveBeenCalledOnce();
    unmount();
  });
});

describe("useCurrentWorkspace", () => {
  it("is the saved clinic while organisations are on", async () => {
    responses.workspaces = [PERSONAL, CLINIC];
    responses.config = { features: { workspaces_multi: true } };
    selectWorkspace("c");
    const { result } = renderHook(() => useCurrentWorkspace(), { wrapper });
    await waitFor(() => expect(result.current?.id).toBe("c"));
  });

  it("ignores the saved choice when organisations are off", async () => {
    responses.workspaces = [PERSONAL, CLINIC];
    responses.config = { features: { workspaces_multi: false } };
    selectWorkspace("c");
    const { result } = renderHook(() => useCurrentWorkspace(), { wrapper });
    await waitFor(() => expect(result.current?.id).toBe("p"));
  });
});

describe("while the flags are unknown", () => {
  it("says whether the saved choice applies, and keeps it when /config fails", () => {
    expect(choiceApplies({ isError: false })).toBeUndefined();
    expect(choiceApplies({ isError: true })).toBe(true);
    const on = { features: { workspaces_multi: true } } as never;
    const off = { features: { workspaces_multi: false } } as never;
    expect(choiceApplies({ data: on, isError: false })).toBe(true);
    expect(choiceApplies({ data: off, isError: false })).toBe(false);
  });

  it("names no workspace until /config answers, so nothing saves to personal", async () => {
    responses.workspaces = [PERSONAL, CLINIC];
    let answer: (v: unknown) => void = () => {};
    responses.config = new Promise((resolve) => (answer = resolve));
    selectWorkspace("c");
    const { result } = renderHook(() => useCurrentWorkspace(), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBeUndefined();
    answer({ features: { workspaces_multi: true } });
    await waitFor(() => expect(result.current?.id).toBe("c"));
  });

  it("keeps the saved choice when /config fails", async () => {
    responses.workspaces = [PERSONAL, CLINIC];
    responses.config = () => Promise.reject(new Error("down"));
    selectWorkspace("c");
    const { result } = renderHook(() => useCurrentWorkspace(), { wrapper });
    await waitFor(() => expect(result.current?.id).toBe("c"));
  });
});
