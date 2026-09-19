import { describe, expect, it } from "vitest";
import { inWorkspace } from "./workspace";

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
