import { describe, expect, it } from "vitest";
import {
  type ContextItem,
  askedItems,
  customKey,
  localTime,
  parseNumber,
  sessionContext,
  settingsFrom,
  splitEmoji,
  toggleOption,
} from "@/lib/context";

function item(over: Partial<ContextItem>): ContextItem {
  return {
    key: "emotions",
    kind: "multi",
    label: null,
    emoji: null,
    custom: false,
    hidden: false,
    archived: false,
    options: [
      { key: "calm", emoji: "😌", label: null, custom: false, archived: false },
      {
        key: "happy",
        emoji: "😄",
        label: null,
        custom: false,
        archived: false,
      },
      { key: "sad", emoji: "😢", label: null, custom: false, archived: false },
    ],
    low_label: null,
    high_label: null,
    minimum: null,
    maximum: null,
    step: null,
    ...over,
  };
}

describe("askedItems", () => {
  it("leaves out hidden and archived items and archived options", () => {
    const own = {
      key: "c_old",
      emoji: "",
      label: "Old",
      custom: true,
      archived: true,
    };
    const asked = askedItems([
      item({ options: [...item({}).options, own] }),
      item({ key: "focus", hidden: true }),
      item({ key: "c_gone", custom: true, archived: true }),
    ]);
    expect(asked.map((i) => i.key)).toEqual(["emotions"]);
    expect(asked[0].options.map((o) => o.key)).toEqual([
      "calm",
      "happy",
      "sad",
    ]);
  });
});

describe("toggleOption", () => {
  it("adds and removes, keeping the order options are shown in", () => {
    const emotions = item({});
    expect(toggleOption(emotions, undefined, "sad")).toEqual(["sad"]);
    expect(toggleOption(emotions, ["sad"], "calm")).toEqual(["calm", "sad"]);
    expect(toggleOption(emotions, ["calm", "sad"], "calm")).toEqual(["sad"]);
    expect(toggleOption(emotions, ["sad"], "sad")).toEqual([]);
  });
});

describe("parseNumber", () => {
  const hours = item({ kind: "number", minimum: 0, maximum: 16, options: [] });
  it("reads dots and commas, refuses blanks and out-of-range values", () => {
    expect(parseNumber(hours, "7.5")).toBe(7.5);
    expect(parseNumber(hours, "6,5")).toBe(6.5);
    expect(parseNumber(hours, "")).toBeUndefined();
    expect(parseNumber(hours, "abc")).toBeUndefined();
    expect(parseNumber(hours, "20")).toBeUndefined();
    expect(parseNumber(hours, "-1")).toBeUndefined();
  });
});

describe("localTime and sessionContext", () => {
  it("writes the wall clock with its offset, not UTC", () => {
    const now = new Date(2026, 10, 13, 21, 5, 9);
    const { local_time, utc_offset_min } = localTime(now);
    expect(local_time.startsWith("2026-11-13T21:05:09")).toBe(true);
    expect(utc_offset_min).toBe(-now.getTimezoneOffset());
    expect(new Date(local_time).getTime()).toBe(now.getTime());
  });

  it("stores a skip as skipped with no answers", () => {
    const now = new Date();
    expect(sessionContext(null, now)).toMatchObject({
      skipped: true,
      answers: {},
    });
    expect(sessionContext({ focus: 3 }, now)).toMatchObject({
      skipped: false,
      answers: { focus: 3 },
    });
  });
});

describe("splitEmoji", () => {
  it("separates a leading emoji, including joined ones", () => {
    expect(splitEmoji("📓 Journaled")).toEqual({
      emoji: "📓",
      label: "Journaled",
    });
    expect(splitEmoji("  Read a book ")).toEqual({
      emoji: "",
      label: "Read a book",
    });
    expect(splitEmoji("🧘‍♀️Yoga").label).toBe("Yoga");
    expect(splitEmoji("☕").label).toBe("");
  });
});

describe("customKey", () => {
  it("builds a key the backend accepts and never reuses one", () => {
    expect(customKey("Ho scritto un diario", [])).toBe(
      "c_ho_scritto_un_diario"
    );
    expect(customKey("Caffè", [])).toBe("c_caffe");
    expect(customKey("Read", ["c_read"])).toBe("c_read_2");
    expect(customKey("🙂", [])).toBe("c_item");
    expect(customKey("x".repeat(80), [])).toMatch(/^c_[a-z0-9_]{1,40}$/);
  });
});

describe("settingsFrom", () => {
  it("turns an effective list back into the personalisation", () => {
    const journaled = {
      key: "c_journaled",
      emoji: "📓",
      label: "Journaled",
      custom: true,
      archived: false,
    };
    const body = settingsFrom([
      item({ key: "last_2h", options: [...item({}).options, journaled] }),
      item({ key: "focus", kind: "scale", hidden: true }),
      item({
        key: "c_pain",
        kind: "scale",
        custom: true,
        label: "Headache",
        low_label: "Strong",
        high_label: "None",
      }),
      item({ key: "c_gone", custom: true, archived: true, label: "Gone" }),
    ]);
    expect(body.hidden).toEqual(["focus"]);
    expect(body.extra_options).toEqual({
      last_2h: [{ key: "c_journaled", label: "Journaled", emoji: "📓" }],
    });
    expect(body.custom).toEqual([
      {
        key: "c_pain",
        kind: "scale",
        label: "Headache",
        emoji: "",
        options: [],
        low_label: "Strong",
        high_label: "None",
      },
    ]);
  });
});
