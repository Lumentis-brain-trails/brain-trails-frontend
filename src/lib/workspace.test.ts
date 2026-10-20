import { describe, expect, it, vi } from "vitest";
import {
  type Workspace,
  editionOf,
  inWorkspace,
  managesMembers,
  SELECTED_WORKSPACE_KEY,
  pickCurrent,
  seatOf,
  selectWorkspace,
} from "./workspace";

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
