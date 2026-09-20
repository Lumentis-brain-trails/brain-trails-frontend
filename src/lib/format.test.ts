import { expect, test } from "vitest";
import { formatDate, formatDuration } from "./format";

test("formatDuration reads minutes and seconds, or a dash", () => {
  expect(formatDuration(null)).toBe("–");
  expect(formatDuration(38.4)).toBe("38 s");
  expect(formatDuration(252)).toBe("4 min 12 s");
});

test("formatDate includes the year", () => {
  expect(formatDate("2026-09-18T10:00:00Z")).toMatch(/2026/);
});
