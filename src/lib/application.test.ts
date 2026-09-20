import { describe, expect, test } from "vitest";
import {
  applicationSchema,
  detectEnvironment,
  toApplicationPayload,
} from "./application";

const base = {
  requested_profile: "private",
  headband: "muse-2",
  contact_ok: false,
} as const;

describe("applicationSchema", () => {
  test("a private applicant needs no credentials", () => {
    expect(applicationSchema.safeParse(base).success).toBe(true);
  });

  test.each([
    [{ requested_profile: "therapist" }, "registration_no"],
    [{ requested_profile: "lab_lead" }, "institution"],
    [{ requested_profile: "lab_member", institution: "Uni" }, "supervisor"],
  ])("each profile asks for its credentials", (extra, field) => {
    const result = applicationSchema.safeParse({ ...base, ...extra });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain(field);
  });
});

describe("detectEnvironment", () => {
  const nav = (userAgent: string, bluetooth: boolean) =>
    ({
      userAgent,
      ...(bluetooth ? { bluetooth: {} } : {}),
    }) as unknown as Navigator;

  test("Chrome on a Mac with Web Bluetooth", () => {
    expect(
      detectEnvironment(
        nav(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
          true
        )
      )
    ).toEqual({ device: "Mac", browser: "Chrome 140", web_bluetooth: true });
  });

  test("Safari on an iPhone, which has no Web Bluetooth", () => {
    expect(
      detectEnvironment(
        nav(
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
          false
        )
      )
    ).toEqual({
      device: "iPhone or iPad",
      browser: "Safari 18",
      web_bluetooth: false,
    });
  });

  test("Edge is not mistaken for Chrome", () => {
    expect(
      detectEnvironment(
        nav(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
          true
        )
      ).browser
    ).toBe("Edge 140");
  });
});

test("the payload turns blanks into nulls and upper-cases the country", () => {
  const payload = toApplicationPayload({
    ...base,
    country: "it",
    organisation: "",
    expected_subjects: 3,
  });
  expect(payload.country).toBe("IT");
  expect(payload.organisation).toBeNull();
  expect(payload.expected_subjects).toBe(3);
});
