import { describe, expect, test } from "vitest";
import {
  REPORTS,
  count,
  funnelRows,
  maxOf,
  median,
  percent,
  series,
  share,
} from "./stats";

describe("statistics helpers", () => {
  test("a hidden group is a dash, never a zero", () => {
    expect(count(null)).toBe("–");
    expect(count(undefined)).toBe("–");
    expect(count(0)).toBe("0");
    expect(count(12)).toBe("12");
    expect(series([3, null, 5])).toEqual([3, 0, 5]);
    expect(maxOf([null, 2, 7])).toBe(7);
    expect(maxOf([null, 0])).toBe(1);
  });

  test("shares and percents need both sides and a non-empty whole", () => {
    expect(percent(5, 20)).toBe("25%");
    expect(percent(5, 0)).toBe("–");
    expect(percent(null, 20)).toBe("–");
    expect(percent(5, null)).toBe("–");
    expect(share(0.333)).toBe("33%");
    expect(share(null)).toBe("–");
  });

  test("the funnel says each step against the first and the one before", () => {
    const rows = funnelRows([
      { step: "registered", people: 40 },
      { step: "verified", people: 30 },
      { step: "accepted", people: 15 },
      { step: "first_session", people: null },
    ]);
    expect(rows[0]).toEqual({
      step: "registered",
      people: 40,
      ofFirst: "",
      ofPrevious: "",
    });
    expect(rows[2]).toMatchObject({ ofFirst: "38%", ofPrevious: "50%" });
    expect(rows[3]).toMatchObject({ people: null, ofFirst: "–" });
    expect(funnelRows([])).toEqual([]);
  });

  test("medians keep a decimal under ten", () => {
    expect(median(2)).toBe("2.0");
    expect(median(36.4)).toBe("36");
    expect(median(null)).toBe("–");
    expect(REPORTS).toEqual(["acquisition", "engagement", "consent"]);
  });
});
