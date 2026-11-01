import { describe, expect, test } from "vitest";
import {
  dueAtFromDate,
  isLate,
  recordable,
  runsLeft,
  subjectLabel,
  subjectWords,
} from "./subjects";

describe("subjects", () => {
  test("a clinic says patients, everything else participants", () => {
    expect(subjectWords("therapy")).toBe("patients");
    expect(subjectWords("research")).toBe("participants");
    expect(subjectWords("personal")).toBe("participants");
  });

  test("a name when there is one, the code otherwise", () => {
    expect(subjectLabel({ code: "P-AB2CD", display_name: "Maria" })).toBe(
      "Maria"
    );
    expect(subjectLabel({ code: "P-AB2CD", display_name: "  " })).toBe(
      "P-AB2CD"
    );
    expect(subjectLabel({ code: "S-1", display_name: null })).toBe("S-1");
  });

  test("only an attested, active, readable subject is recordable", () => {
    const base = {
      readable: true,
      consent_at: "2026-10-20T00:00:00Z",
      archived_at: null,
    };
    expect(recordable(base)).toBe(true);
    expect(recordable({ ...base, consent_at: null })).toBe(false);
    expect(recordable({ ...base, archived_at: "2026-10-21T00:00:00Z" })).toBe(
      false
    );
    expect(recordable({ ...base, readable: false })).toBe(false);
  });

  test("runs left, open-ended allowances have none to count", () => {
    expect(runsLeft({ runs_allowed: 3, runs_done: 1 })).toBe(2);
    expect(runsLeft({ runs_allowed: 1, runs_done: 4 })).toBe(0);
    expect(runsLeft({ runs_allowed: null, runs_done: 4 })).toBeNull();
  });

  test("a due day is late only once it is over", () => {
    const due = "2026-10-20T12:00:00Z";
    expect(isLate(due, new Date("2026-10-20T20:00:00Z"))).toBe(false);
    expect(isLate(due, new Date("2026-10-21T12:00:01Z"))).toBe(true);
    expect(isLate(null)).toBe(false);
  });

  test("a date input becomes midday UTC, anything else no date", () => {
    expect(dueAtFromDate("2026-11-02")).toBe("2026-11-02T12:00:00Z");
    expect(dueAtFromDate("")).toBeNull();
    expect(dueAtFromDate("2/11/2026")).toBeNull();
  });
});
