import { describe, expect, test } from "vitest";
import {
  MAX_GROUPS,
  groupSlot,
  labelGroups,
  legend,
  markerOf,
  parseLabel,
} from "./labels";

describe("parseLabel", () => {
  test("splits what was shown from what was done", () => {
    expect(parseLabel("cargo_pressed")).toEqual({
      group: "cargo",
      act: "pressed",
    });
    expect(parseLabel("debris_held")).toEqual({ group: "debris", act: "held" });
  });

  test("keeps underscores that belong to the condition", () => {
    expect(parseLabel("red_cargo_right")).toEqual({
      group: "red_cargo",
      act: "right",
    });
  });

  test("a label outside the vocabulary is all group", () => {
    expect(parseLabel("mystery")).toEqual({ group: "mystery", act: null });
    expect(parseLabel("odd_thing")).toEqual({ group: "odd_thing", act: null });
  });
});

describe("markerOf", () => {
  test("a press is a dot, holding back a ring, a wrong key a diamond", () => {
    expect(markerOf("pressed")).toBe("dot");
    expect(markerOf("right")).toBe("dot");
    expect(markerOf("held")).toBe("ring");
    expect(markerOf("missed")).toBe("ring");
    expect(markerOf("wrong")).toBe("diamond");
    expect(markerOf(null)).toBe("dot");
  });
});

describe("labelGroups", () => {
  test("cargo and debris keep their slots whatever order they appear in", () => {
    expect(labelGroups([["debris_held", null, "cargo_pressed"]])).toEqual([
      "cargo",
      "debris",
    ]);
  });

  test("a group keeps its slot across blocks, since slots are per recording", () => {
    const groups = labelGroups([
      ["match_right"],
      null,
      ["lure_wrong", "match_missed"],
    ]);
    expect(groups).toEqual(["match", "lure"]);
    expect(groupSlot(groups, "lure")).toBe(1);
  });

  test("past the validated hues the rest fold into other", () => {
    const groups = labelGroups([["a_right", "b_right", "c_right", "d_right"]]);
    expect(groups).toHaveLength(MAX_GROUPS);
    expect(groupSlot(groups, "d")).toBeNull();
  });
});

describe("legend", () => {
  test("counts each label and orders by slot, then by act", () => {
    const entries = legend(
      [
        "debris_held",
        "cargo_held",
        "cargo_pressed",
        null,
        "cargo_pressed",
        "debris_pressed",
      ],
      ["cargo", "debris"]
    );
    expect(entries.map((e) => [e.label, e.count])).toEqual([
      ["cargo_pressed", 2],
      ["cargo_held", 1],
      ["debris_pressed", 1],
      ["debris_held", 1],
    ]);
  });
});
