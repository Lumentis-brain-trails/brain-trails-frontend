/**
 * The beta application that comes with a registration (backend V3-0008, sprint S15).
 *
 * Registration is an application: the admin chooses the sample from these answers. The
 * credentials each profile must give mirror the backend's `ApplicationIn` rules, so a
 * form that passes here is not refused there. The device, the browser and Web Bluetooth
 * support are detected and prefilled; the person may correct them, and an unsupported
 * browser is recorded, never blocked.
 */
import { z } from "zod";
import type { components } from "@/lib/api-types";

export type ApplicationPayload = components["schemas"]["ApplicationIn"];
export type BetaProfile = components["schemas"]["BetaProfile"];

export const BETA_PROFILES = [
  "private",
  "therapist",
  "lab_lead",
  "lab_member",
] as const satisfies readonly BetaProfile[];

export const HEADBANDS = ["muse-2", "muse-s-athena", "other", "none"] as const;

const optionalText = (max: number) =>
  z.string().max(max).optional().or(z.literal(""));

export const applicationSchema = z
  .object({
    requested_profile: z.enum(BETA_PROFILES),
    organisation: optionalText(200),
    role_title: optionalText(200),
    registration_no: optionalText(100),
    institution: optionalText(200),
    supervisor: optionalText(200),
    purpose: optionalText(4000),
    headband: z.enum(HEADBANDS),
    device: optionalText(200),
    browser: optionalText(200),
    web_bluetooth: z.boolean().optional(),
    country: z
      .string()
      .regex(/^[A-Za-z]{2}$/, { message: "country" })
      .optional()
      .or(z.literal("")),
    language: optionalText(10),
    expected_subjects: z.coerce.number().int().min(0).max(100_000).optional(),
    contact_ok: z.boolean(),
  })
  .superRefine((value, ctx) => {
    const need = (field: keyof typeof value, when: boolean) => {
      if (when && !value[field]) {
        ctx.addIssue({ code: "custom", path: [field], message: "required" });
      }
    };
    const lab =
      value.requested_profile === "lab_lead" ||
      value.requested_profile === "lab_member";
    need("registration_no", value.requested_profile === "therapist");
    need("institution", lab);
    need("supervisor", value.requested_profile === "lab_member");
  });

export type ApplicationForm = z.output<typeof applicationSchema>;

/** What the browser can tell about itself; every field is a prefill, not a verdict. */
export interface DetectedEnvironment {
  device: string;
  browser: string;
  web_bluetooth: boolean;
}

// Order matters: Edge and Chrome both say "Chrome", Chrome says "Safari".
const BROWSERS: readonly (readonly [string, RegExp])[] = [
  ["Edge", /Edg\/(\d+)/],
  ["Chrome", /Chrome\/(\d+)/],
  ["Firefox", /Firefox\/(\d+)/],
  ["Safari", /Version\/(\d+).*Safari/],
];

const DEVICES: readonly (readonly [string, RegExp])[] = [
  ["iPhone or iPad", /iPhone|iPad/],
  ["Android", /Android/],
  ["Mac", /Mac OS X/],
  ["Windows PC", /Windows/],
  ["Linux", /Linux/],
];

/** Read the platform, the browser and whether Web Bluetooth exists (headband pairing). */
export function detectEnvironment(
  nav: Navigator = navigator
): DetectedEnvironment {
  const ua = nav.userAgent;
  let browser = "Unknown browser";
  for (const [name, pattern] of BROWSERS) {
    const version = pattern.exec(ua)?.[1];
    if (version !== undefined) {
      browser = `${name} ${version}`;
      break;
    }
  }
  const device =
    DEVICES.find(([, pattern]) => pattern.test(ua))?.[0] ?? "Unknown device";
  return { device, browser, web_bluetooth: "bluetooth" in nav };
}

/** Form values -> the backend's `ApplicationIn` (empty strings become nulls). */
export function toApplicationPayload(
  form: ApplicationForm
): ApplicationPayload {
  const text = (v: string | undefined) => (v ? v : null);
  return {
    requested_profile: form.requested_profile,
    organisation: text(form.organisation),
    role_title: text(form.role_title),
    registration_no: text(form.registration_no),
    institution: text(form.institution),
    supervisor: text(form.supervisor),
    purpose: text(form.purpose),
    headband: form.headband,
    device: text(form.device),
    browser: text(form.browser),
    web_bluetooth: form.web_bluetooth ?? null,
    country: form.country ? form.country.toUpperCase() : null,
    language: text(form.language),
    expected_subjects: form.expected_subjects ?? null,
    contact_ok: form.contact_ok,
  };
}
