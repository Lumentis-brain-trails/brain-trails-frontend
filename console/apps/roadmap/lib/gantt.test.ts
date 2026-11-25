import { describe, expect, test } from "vitest";
import {
  type Item,
  type Milestone,
  addDays,
  daysBetween,
  dependencies,
  isLate,
  mondayOf,
  monthStarts,
  nextMilestone,
  rowsByTrack,
  spanOf,
  weekStarts,
} from "./gantt";

const item = (
  id: string,
  track: string,
  start: string,
  end: string,
  status: Item["status"] = "planned",
  depends_on: string[] = []
): Item => ({
  id,
  track,
  label: id.toUpperCase(),
  name: id,
  start,
  end,
  status,
  tentative: false,
  size: null,
  depends_on,
  note: null,
  tasks: [],
  questions: [],
  links: [],
});

const milestone = (
  id: string,
  date: string,
  status: Milestone["status"]
): Milestone => ({ id, track: "v4", date, name: id, status });

describe("the roadmap's day arithmetic", () => {
  test("days are compared as days, whatever the time zone", () => {
    expect(daysBetween("2026-11-05", "2026-11-15")).toBe(10);
    expect(daysBetween("2026-11-15", "2026-11-05")).toBe(-10);
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  test("the Monday of a week, and the Mondays and month starts in a span", () => {
    expect(mondayOf("2026-11-05")).toBe("2026-11-02"); // a Thursday
    expect(mondayOf("2026-11-02")).toBe("2026-11-02");
    expect(mondayOf("2026-11-08")).toBe("2026-11-02"); // a Sunday
    expect(weekStarts("2026-11-02", "2026-11-20")).toEqual([
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
    ]);
    expect(weekStarts("2026-11-03", "2026-11-10")).toEqual(["2026-11-09"]);
    expect(monthStarts("2026-10-12", "2027-01-20")).toEqual([
      "2026-11-01",
      "2026-12-01",
      "2027-01-01",
    ]);
    expect(monthStarts("2026-11-02", "2026-11-20")).toEqual([]);
  });

  test("the span starts on the Monday before the first date and ends a week after the last", () => {
    const span = spanOf(
      {
        items: [item("a", "v4", "2026-10-15", "2026-10-28")],
        milestones: [milestone("m", "2026-12-08", "planned")],
      },
      "2026-11-05"
    );
    expect(span).toEqual({ start: "2026-10-12", end: "2026-12-15" });
    // Today is always inside, even when everything is in the past.
    const past = spanOf(
      { items: [item("a", "v4", "2026-01-01", "2026-01-10")], milestones: [] },
      "2026-11-05"
    );
    expect(past.end).toBe("2026-11-12");
  });
});

describe("rows, lateness, dependencies, the next milestone", () => {
  const roadmap = {
    tracks: [
      { id: "v4", name: "V4", plan: null },
      { id: "mobile", name: "Phone app", plan: null },
    ],
    items: [
      item("apk", "mobile", "2026-11-06", "2026-11-15", "planned", ["t1"]),
      item("t2", "v4", "2026-10-20", "2026-10-28", "done"),
      item("t1", "v4", "2026-10-20", "2026-10-29", "review"),
      item("t0", "v4", "2026-10-15", "2026-10-28", "done"),
    ],
  };

  test("items group by track in the tracks' order, sorted by start then end", () => {
    const rows = rowsByTrack(roadmap);
    expect(rows.map((r) => r.track.id)).toEqual(["v4", "mobile"]);
    expect(rows[0].items.map((i) => i.id)).toEqual(["t0", "t2", "t1"]);
    expect(rows[1].items.map((i) => i.id)).toEqual(["apk"]);
  });

  test("an unfinished item past its end is late; a done one never is", () => {
    expect(isLate({ status: "review", end: "2026-10-29" }, "2026-11-05")).toBe(
      true
    );
    expect(isLate({ status: "done", end: "2026-10-29" }, "2026-11-05")).toBe(
      false
    );
    expect(isLate({ status: "planned", end: "2026-11-15" }, "2026-11-05")).toBe(
      false
    );
  });

  test("dependencies resolve to items; the next milestone skips done ones", () => {
    expect(dependencies(roadmap.items[0], roadmap).map((i) => i.id)).toEqual([
      "t1",
    ]);
    const next = nextMilestone(
      [
        milestone("far", "2027-01-20", "planned"),
        milestone("done", "2026-11-01", "done"),
        milestone("soon", "2026-11-15", "planned"),
      ],
      "2026-11-05"
    );
    expect(next?.id).toBe("soon");
    expect(nextMilestone([], "2026-11-05")).toBeUndefined();
  });
});
