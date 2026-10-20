import { describe, expect, test } from "vitest";
import {
  NO_FILTERS,
  byDay,
  byPlan,
  filterQuery,
  hoursText,
  reportHref,
  splitDetail,
  type Entry,
  type Plan,
} from "./worklog";

const entry = (id: string, date: string, tokens_new: number): Entry => ({
  id,
  date,
  started: null,
  started_local: null,
  category: null,
  summary: null,
  minutes: 0,
  thread: "t",
  session: null,
  areas: [],
  title: id,
  detail: "",
  links: [],
  status: "done",
  tokens_new,
  tokens_cache: 0,
  updated_at: "2026-10-20T00:00:00Z",
});

describe("work log helpers", () => {
  test("filters become the query the routes read, empty ones dropped", () => {
    expect(filterQuery(NO_FILTERS)).toBe("");
    expect(
      filterQuery(
        { ...NO_FILTERS, area: "OPS O1", status: "done" },
        { limit: 30, cursor: null }
      )
    ).toBe("?area=OPS+O1&status=done&limit=30");
  });

  test("the report address carries the filters and the language", () => {
    expect(
      reportHref({ ...NO_FILTERS, thread: "Coordinamento" }, "pdf", "it")
    ).toBe("/api/ops/worklog/report.pdf?thread=Coordinamento&lang=it");
  });

  test("entries group by day in the order they came, with each day's tokens", () => {
    const days = byDay([
      entry("d", "2026-10-20", 5),
      entry("c", "2026-10-13", 2),
      entry("b", "2026-10-13", 3),
    ]);
    expect(days.map((d) => [d.date, d.entries.length, d.tokens])).toEqual([
      ["2026-10-20", 1, 5],
      ["2026-10-13", 2, 5],
    ]);
  });

  test("a detail splits into prose and bullets", () => {
    expect(splitDetail("Intro line.\n- one\n\n- two\nmore")).toEqual({
      prose: "Intro line. more",
      bullets: ["one", "two"],
    });
  });
});

describe("hours and plans", () => {
  test("minutes read as hours with two decimals in the reader's language", () => {
    expect(hoursText(39, "it")).toBe("0,65");
    expect(hoursText(165, "en")).toBe("2.75");
    expect(hoursText(0, "it")).toBe("0,00");
  });

  test("plans group by name, sprints in order", () => {
    const plan = (id: string, name: string): Plan => ({
      id,
      plan: name,
      sprint: id,
      name: id,
      note: "",
      status: "planned",
    });
    const grouped = byPlan([
      plan("O0", "OPS"),
      plan("O1", "OPS"),
      plan("T0", "V4"),
    ]);
    expect(
      grouped.map((g) => [g.plan, g.sprints.map((s) => s.sprint)])
    ).toEqual([
      ["OPS", ["O0", "O1"]],
      ["V4", ["T0"]],
    ]);
  });
});
