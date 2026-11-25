import { describe, expect, test } from "vitest";
import {
  type StudentAnswers,
  WAITING_PATH,
  heldRedirect,
  isCompleteCode,
  normalCode,
  signupReady,
  taughtSchools,
  toSchoolSignup,
} from "./schools";
import type { Workspace } from "./workspace";

const NOW = new Date("2026-11-23T12:00:00Z");
const CHILD = 2012;
const ADULT = 1990;

const answers = (over: Partial<StudentAnswers> = {}): StudentAnswers => ({
  code: "abcd-efgh",
  guardianName: "Maria Rossi",
  guardianRelationship: "parent",
  guardianConsent: true,
  ...over,
});

function ws(kind: string, relations: string[], status = "active"): Workspace {
  return {
    id: `${kind}-${relations.join("")}-${status}`,
    kind,
    relations,
    status,
    slug: kind,
    name: kind,
    region: "eu",
    created_at: "2026-11-23T00:00:00Z",
  };
}

describe("class codes", () => {
  test("a typed code is read the way the API stores it", () => {
    expect(normalCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(isCompleteCode("abcd efgh")).toBe(true);
    expect(isCompleteCode("ABCD-EF")).toBe(false);
  });
});

describe("the hold", () => {
  test("a held account goes to the waiting page and stays there", () => {
    expect(heldRedirect("awaiting_teacher", "/home")).toBe(WAITING_PATH);
    expect(heldRedirect("own_consent_required", "/protocols")).toBe(
      WAITING_PATH
    );
    expect(heldRedirect("enrolment_refused", WAITING_PATH)).toBeNull();
  });

  test("any other account is left where it is", () => {
    expect(heldRedirect(null, "/home")).toBeNull();
    expect(heldRedirect(undefined, "/home")).toBeNull();
  });
});

describe("the student's sign-up", () => {
  test("no code, no school", () => {
    expect(toSchoolSignup(answers({ code: " " }), CHILD, NOW)).toBeUndefined();
  });

  test("a minor sends the guardian with the code", () => {
    expect(
      toSchoolSignup(answers({ guardianName: " Maria Rossi " }), CHILD, NOW)
    ).toEqual({
      code: "ABCDEFGH",
      guardian_name: "Maria Rossi",
      guardian_relationship: "parent",
      guardian_consent: true,
    });
  });

  test("an adult sends the code alone, never a guardian", () => {
    expect(toSchoolSignup(answers(), ADULT, NOW)).toEqual({
      code: "ABCDEFGH",
      guardian_consent: false,
    });
  });

  test("a minor's form waits for the guardian's name, relationship and tick", () => {
    expect(signupReady(answers(), CHILD, true, NOW)).toBe(true);
    expect(signupReady(answers(), CHILD, false, NOW)).toBe(false);
    expect(signupReady(answers({ guardianName: "M" }), CHILD, true, NOW)).toBe(
      false
    );
    expect(
      signupReady(answers({ guardianRelationship: "" }), CHILD, true, NOW)
    ).toBe(false);
    expect(
      signupReady(answers({ guardianConsent: false }), CHILD, true, NOW)
    ).toBe(false);
  });

  test("an adult's form, or one without a code, needs the student's tick only", () => {
    const none = answers({
      guardianName: "",
      guardianRelationship: "",
      guardianConsent: false,
    });
    expect(signupReady(none, ADULT, true, NOW)).toBe(true);
    expect(signupReady({ ...none, code: "" }, CHILD, true, NOW)).toBe(true);
  });
});

describe("taught schools", () => {
  test("an active school with an owner or admin seat, nothing else", () => {
    const mine = ws("school", ["owner"]);
    const admin = ws("school", ["admin"]);
    expect(
      taughtSchools([
        ws("personal", ["owner"]),
        mine,
        admin,
        ws("school", ["member"]),
        ws("school", [], "pending"),
        ws("practice", ["owner"]),
      ])
    ).toEqual([mine, admin]);
    expect(taughtSchools(undefined)).toEqual([]);
  });
});
