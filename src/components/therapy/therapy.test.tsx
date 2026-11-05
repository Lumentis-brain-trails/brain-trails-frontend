import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import messages from "../../../messages/en.json";
import { AfterSession } from "./AfterSession";
import { ClinicHome } from "./ClinicHome";
import { PatientTimeline } from "./PatientTimeline";
import { SessionInWords } from "./SessionInWords";

const get = vi.fn();
const put = vi.fn();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    get: (p: string) => get(p),
    put: (p: string, b: unknown) => put(p, b),
  },
}));

const t = messages.therapy;
const now = new Date();
const daysAgo = (n: number) => new Date(+now - n * 86_400_000).toISOString();

const timeline = {
  subject_id: "p1",
  since: daysAgo(56),
  until: now.toISOString(),
  weeks: 8,
  share_results: "nothing",
  sessions: [
    {
      id: "s1",
      title: "Signal Navigator",
      status: "done",
      started_at: daysAgo(14),
      minutes: 12,
      assignment_id: "a1",
      recording_id: "r1",
      verdict: "good",
      notes: 0,
      opened: true,
      measures: { "go-no-go.rt_median": 500 },
    },
    {
      id: "s2",
      title: "Signal Navigator",
      status: "done",
      started_at: daysAgo(2),
      minutes: 11,
      assignment_id: "a1",
      recording_id: "r2",
      verdict: "usable",
      notes: 2,
      opened: false,
      measures: { "go-no-go.rt_median": 420 },
    },
  ],
  assignments: [
    {
      id: "a1",
      protocol_title: "Signal Navigator",
      runs_allowed: 4,
      runs_done: 2,
      due_at: daysAgo(1),
      open: true,
      late: true,
      close_reason: null,
    },
  ],
  adherence: { assigned: 4, done: 2, share: 0.5 },
  measures: [
    {
      key: "go-no-go.rt_median",
      family: "go-no-go",
      metric: "rt_median_ms",
      higher_is: "worse",
      points: [
        { session_id: "s1", at: daysAgo(14), value: 500 },
        { session_id: "s2", at: daysAgo(2), value: 420 },
      ],
    },
  ],
  changes: [
    {
      key: "go-no-go.rt_median",
      family: "go-no-go",
      metric: "rt_median_ms",
      previous: 500,
      last: 420,
      direction: "down",
      reading: "better",
    },
  ],
};

function renderWith(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  get.mockReset();
  put.mockReset();
});
afterEach(() => cleanup());

test("the patient's eight weeks: adherence, changes in words, measures, sessions, sharing", async () => {
  get.mockImplementation((path: string) => {
    if (path.startsWith("subjects/p1/timeline"))
      return Promise.resolve(timeline);
    if (path === "subjects/p1/landscape")
      return Promise.reject(new Error("not ready"));
    return Promise.reject(new Error(path));
  });
  put.mockResolvedValue({ share_results: "summary" });
  await act(async () => {
    renderWith(
      <PatientTimeline subjectId="p1" share="nothing" canShare hasAccount />
    );
  });
  expect(
    await screen.findByText("2 of 4 assigned runs done (50%).")
  ).toBeTruthy();
  expect(screen.getByText("1 assignment late")).toBeTruthy();
  expect(
    screen.getByRole("img", { name: "2 sessions over 8 weeks" })
  ).toBeTruthy();
  // a change in words, then the numbers
  expect(screen.getByText("(better)", { exact: false })).toBeTruthy();
  expect(screen.getByText("500 ms → 420 ms", { exact: false })).toBeTruthy();
  // the measure's last value, and the newest session first with its notes
  expect(screen.getByText("420 ms")).toBeTruthy();
  expect(screen.getByText(/usable signal · 11 min · 2 notes/)).toBeTruthy();
  expect(screen.getByText(t.timeline.new)).toBeTruthy();
  expect(screen.getByText(t.landscape.notReady)).toBeTruthy();

  expect(screen.getByText(t.share.nothingHint)).toBeTruthy();
  await act(async () => {
    fireEvent.click(screen.getByRole("radio", { name: t.share.summary }));
  });
  expect(put).toHaveBeenCalledWith("subjects/p1/share", { level: "summary" });
  expect(await screen.findByText(t.share.summaryHint)).toBeTruthy();
});

test("a session in plain words, against the one before", async () => {
  get.mockResolvedValue(timeline);
  await act(async () => {
    renderWith(<SessionInWords subjectId="p1" sessionId="s2" />);
  });
  expect(await screen.findByText(t.words.verdict.usable)).toBeTruthy();
  expect(screen.getByText("(the session before: 500 ms)")).toBeTruthy();
});

test("the clinic home: waiting for review, due today, my patients", async () => {
  get.mockImplementation((path: string) => {
    if (path.startsWith("workspaces/w1/subjects"))
      return Promise.resolve([
        {
          id: "p1",
          code: "P-1",
          display_name: "Maria Rossi",
          readable: true,
          archived_at: null,
          carers: [{ user_id: "u", email: "", you: true }],
          last_session_at: daysAgo(2),
        },
        {
          id: "p2",
          code: "P-2",
          display_name: null,
          readable: true,
          archived_at: null,
          carers: [{ user_id: "v", email: "", you: false }],
          last_session_at: null,
        },
      ]);
    if (path.startsWith("workspaces/w1/assignments"))
      return Promise.resolve([
        {
          id: "a1",
          subject_id: "p1",
          subject_code: "P-1",
          protocol_title: "Signal Navigator",
          due_at: daysAgo(2),
        },
        {
          id: "a2",
          subject_id: "p1",
          subject_code: "P-1",
          protocol_title: "Later",
          due_at: daysAgo(-5),
        },
      ]);
    if (path === "workspaces/w1/review")
      return Promise.resolve([
        {
          session_id: "s2",
          recording_id: "r2",
          subject_id: "p1",
          subject_code: "P-1",
          display_name: "Maria Rossi",
          title: "Signal Navigator",
          started_at: daysAgo(2),
          verdict: "usable",
        },
      ]);
    return Promise.reject(new Error(path));
  });
  await act(async () => {
    renderWith(<ClinicHome workspace={{ id: "w1" } as never} />);
  });
  const review = await screen.findByRole("region", { name: t.home.review });
  expect(review.querySelector('a[href="/recordings/r2"]')).toBeTruthy();
  const today = screen.getByRole("region", { name: t.home.today });
  expect(today.textContent).toContain("Signal Navigator");
  expect(today.textContent).not.toContain("Later");
  expect(today.textContent).toContain(t.home.late);
  const mine = screen.getByRole("region", { name: t.home.patients });
  expect(mine.textContent).toContain("Maria Rossi");
  expect(mine.textContent).not.toContain("P-2"); // not in my care
});

test("after a session the patient sees done, a streak and a picture - only with the flag", async () => {
  const summaries = [
    {
      id: "x2",
      kind: "landscape_change",
      session_id: "s2",
      created_at: now.toISOString(),
      payload: {
        before: [
          [0, 1],
          [1, 0],
        ],
        after: [
          [1, 2],
          [3, 1],
        ],
      },
    },
    {
      id: "x1",
      kind: "completed",
      session_id: "s2",
      created_at: now.toISOString(),
      payload: { sessions_done: 4, streak_days: 3 },
    },
  ];
  get.mockImplementation((path: string) =>
    path === "config"
      ? Promise.resolve({
          env: "test",
          version: "x",
          consent_version: "v",
          features: { client_summary: false },
        })
      : Promise.resolve(summaries)
  );
  let view = renderWith(<AfterSession />);
  await act(() => new Promise((r) => setTimeout(r, 0)));
  expect(screen.queryByText(t.after.title)).toBeNull();
  expect(get).not.toHaveBeenCalledWith("me/summaries?limit=10");
  view.unmount();

  get.mockImplementation((path: string) =>
    path === "config"
      ? Promise.resolve({
          env: "test",
          version: "x",
          consent_version: "v",
          features: { client_summary: true },
        })
      : Promise.resolve(summaries)
  );
  view = renderWith(<AfterSession />);
  expect(
    await screen.findByText("Session complete: 3 days in a row.")
  ).toBeTruthy();
  expect(screen.getByRole("img", { name: t.after.before })).toBeTruthy();
  expect(screen.getByRole("img", { name: t.after.after })).toBeTruthy();
  // a picture, no numbers
  expect(view.container.textContent).not.toMatch(/\d+%|\d+\.\d/);
});
