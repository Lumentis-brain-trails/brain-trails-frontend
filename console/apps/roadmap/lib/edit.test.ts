import { describe, expect, test } from "vitest";
import {
  checkItem,
  checkMilestone,
  freeId,
  itemDraft,
  itemOf,
  milestoneDraft,
  milestoneOf,
  newItemDraft,
  newMilestoneDraft,
  slugOf,
} from "./edit";
import type { Item, Roadmap } from "./gantt";

const ITEM: Item = {
  id: "apk",
  track: "mobile",
  label: "APK",
  name: "Android app",
  start: "2026-11-06",
  end: "2026-11-15",
  status: "planned",
  tentative: false,
  size: "10 days",
  depends_on: ["t2"],
  note: null,
  tasks: [{ day: "Day 1", text: "Add the platform | with BLE" }],
  questions: ["Where does the file live?"],
  links: [{ label: "Docs", url: "https://capacitorjs.com" }],
};

const ROADMAP: Roadmap = {
  revision: 3,
  editable: true,
  updated: "2026-11-05",
  assumptions: "",
  tracks: [
    { id: "v4", name: "Plan V4", plan: null },
    { id: "mobile", name: "Phone app", plan: null },
  ],
  items: [ITEM],
  milestones: [
    {
      id: "m-apk",
      track: "mobile",
      date: "2026-11-15",
      name: "APK",
      status: "planned",
    },
  ],
};

describe("ids", () => {
  test("from a code or a name, lowercase with dashes, starting with a letter", () => {
    expect(slugOf("O3b")).toBe("o3b");
    expect(slugOf("Hardening & release")).toBe("hardening-release");
    expect(slugOf("Città più bella")).toBe("citta-piu-bella");
    expect(slugOf("2027 plan")).toBe("i-2027-plan");
    expect(slugOf("  ---  ")).toBe("");
    expect(slugOf("x".repeat(60))).toHaveLength(40);
  });
  test("a taken id gets the next free number", () => {
    expect(freeId("apk", ["t2"])).toBe("apk");
    expect(freeId("apk", ["apk", "apk-2"])).toBe("apk-3");
  });
});

describe("an item's form", () => {
  test("round-trips an item, its lists as lines split on the first bar", () => {
    const draft = itemDraft(ITEM);
    expect(draft.tasks).toBe("Day 1 | Add the platform | with BLE");
    expect(draft.links).toBe("Docs | https://capacitorjs.com");
    expect(itemOf(draft)).toEqual(ITEM);
  });
  test("empty optional fields go back as null, blank lines are dropped", () => {
    const out = itemOf({
      ...itemDraft(ITEM),
      size: "  ",
      note: "",
      questions: "\n  one  \n\n",
      depends_on: ["t2", "apk"],
    });
    expect(out.size).toBeNull();
    expect(out.note).toBeNull();
    expect(out.questions).toEqual(["one"]);
    expect(out.depends_on).toEqual(["t2"]); // never on itself
  });
  test("a new item starts on the first track, a week from today, planned", () => {
    const d = newItemDraft(ROADMAP, "2026-11-05");
    expect(d).toMatchObject({
      track: "v4",
      start: "2026-11-05",
      end: "2026-11-11",
    });
    expect(d.status).toBe("planned");
  });
  test("the checks a person can fix before sending", () => {
    const ok = itemDraft(ITEM);
    expect(checkItem(ok, ROADMAP, false)).toEqual({});
    expect(checkItem({ ...ok, id: "new-one" }, ROADMAP, true)).toEqual({});
    expect(checkItem({ ...ok, id: "" }, ROADMAP, true).id).toBe("required");
    expect(checkItem({ ...ok, id: "Bad Id" }, ROADMAP, true).id).toBe("badId");
    expect(checkItem(ok, ROADMAP, true).id).toBe("idTaken");
    expect(checkItem({ ...ok, label: " ", name: "" }, ROADMAP, false)).toEqual({
      label: "required",
      name: "required",
    });
    expect(checkItem({ ...ok, track: "" }, ROADMAP, false).track).toBe(
      "required"
    );
    expect(
      checkItem({ ...ok, start: "2026-02-30" }, ROADMAP, false).start
    ).toBe("badDate");
    expect(checkItem({ ...ok, end: "soon" }, ROADMAP, false).end).toBe(
      "badDate"
    );
    expect(checkItem({ ...ok, end: "2026-11-01" }, ROADMAP, false).end).toBe(
      "endBeforeStart"
    );
    expect(checkItem({ ...ok, tasks: "no bar" }, ROADMAP, false).tasks).toBe(
      "badLine"
    );
    expect(checkItem({ ...ok, links: "Docs | " }, ROADMAP, false).links).toBe(
      "badLine"
    );
    expect(
      checkItem({ ...ok, links: "Docs | javascript:alert" }, ROADMAP, false)
        .links
    ).toBe("badUrl");
  });
});

describe("a milestone's form", () => {
  test("round-trips and checks", () => {
    const m = ROADMAP.milestones![0];
    expect(milestoneOf(milestoneDraft(m))).toEqual(m);
    const fresh = newMilestoneDraft(ROADMAP, "2026-11-05");
    expect(fresh).toMatchObject({
      track: "v4",
      date: "2026-11-05",
      status: "planned",
    });
    expect(checkMilestone(fresh, ROADMAP, true)).toEqual({
      id: "required",
      name: "required",
    });
    expect(
      checkMilestone({ ...fresh, id: "m-apk", name: "x" }, ROADMAP, true).id
    ).toBe("idTaken");
    expect(
      checkMilestone({ ...fresh, id: "Nope", name: "x" }, ROADMAP, true).id
    ).toBe("badId");
    expect(
      checkMilestone(
        { ...fresh, id: "m-x", name: "x", track: "", date: "x" },
        ROADMAP,
        true
      )
    ).toEqual({ track: "required", date: "badDate" });
    expect(checkMilestone(milestoneDraft(m), ROADMAP, false)).toEqual({});
  });
});
