import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { IntlEn } from "@console/i18n/testing";
import { RoadmapApp } from "./RoadmapApp";
import type { Roadmap } from "./lib/gantt";

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const del = vi.fn();
vi.mock("@console/lib/client", async (orig) => ({
  ...(await orig<typeof import("@console/lib/client")>()),
  ops: {
    get: (path: string) => get(path),
    post: (path: string, body: unknown) => post(path, body),
    put: (path: string, body: unknown) => put(path, body),
    delete: (path: string) => del(path),
  },
}));

const ROADMAP: Roadmap = {
  revision: 0,
  editable: false,
  updated: "2026-11-05",
  assumptions: "Planned dates are estimates.",
  tracks: [
    { id: "v4", name: "Plan V4", plan: null },
    { id: "mobile", name: "Phone app", plan: null },
  ],
  items: [
    {
      id: "t2",
      track: "v4",
      label: "T2",
      name: "Organisations and care teams",
      start: "2026-10-20",
      end: "2026-10-28",
      status: "done",
      tentative: false,
      size: "7-8 days",
      depends_on: [],
      note: null,
      tasks: [],
      questions: [],
      links: [],
    },
    {
      id: "apk",
      track: "mobile",
      label: "APK",
      name: "Android app downloadable from the site",
      start: "2026-11-06",
      end: "2026-11-15",
      status: "planned",
      tentative: false,
      size: "10 days",
      depends_on: ["t2"],
      note: "Not the app store.",
      tasks: [{ day: "Day 1 · 6 Nov", text: "Add the Android platform." }],
      questions: ["Where does the file live?"],
      links: [
        {
          label: "Capacitor Android",
          url: "https://capacitorjs.com/docs/android",
        },
      ],
    },
  ],
  milestones: [
    {
      id: "m-apk",
      track: "mobile",
      date: "2026-11-15",
      name: "Phone app on the site",
      status: "planned",
    },
  ],
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <IntlEn>
      <QueryClientProvider client={client}>
        <RoadmapApp semver="1.0.0" />
      </QueryClientProvider>
    </IntlEn>
  );
}

beforeEach(() => {
  get.mockImplementation(() => Promise.resolve(ROADMAP));
});

const EDITABLE: Roadmap = { ...ROADMAP, editable: true };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("the chart draws every track and item, and the milestones list", async () => {
  renderPage();
  const chart = await screen.findByRole("img", {
    name: "Gantt of the roadmap",
  });
  expect(chart).toBeTruthy();
  expect(get).toHaveBeenCalledWith("roadmap");
  expect(screen.getByText("Plan V4")).toBeTruthy();
  expect(screen.getByText("Phone app")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "T2 Organisations and care teams" })
  ).toBeTruthy();
  expect(screen.getByText("Phone app on the site")).toBeTruthy();
  expect(screen.getByText(/Pick an item on the chart/)).toBeTruthy();
  // Read-only for a level without roadmap:write.
  expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add milestone" })).toBeNull();
});

test("a click on a row opens the item with its tasks, questions and dependencies", async () => {
  renderPage();
  const row = await screen.findByRole("button", {
    name: "APK Android app downloadable from the site",
  });
  fireEvent.click(row);
  expect(
    screen.getByRole("heading", {
      name: "Android app downloadable from the site",
    })
  ).toBeTruthy();
  expect(screen.getByText("Add the Android platform.")).toBeTruthy();
  expect(screen.getByText("Where does the file live?")).toBeTruthy();
  expect(screen.getByText(/Depends on:/)).toBeTruthy();
  expect(
    screen.getByText("T2 Organisations and care teams", { selector: "p" })
  ).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Capacitor Android" })
  ).toHaveAttribute("href", "https://capacitorjs.com/docs/android");
  expect(screen.getByText("planned", { selector: "span" })).toBeTruthy();
});

async function openApk() {
  fireEvent.click(
    await screen.findByRole("button", {
      name: "APK Android app downloadable from the site",
    })
  );
}

function field(label: string) {
  return screen.getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement;
}

test("an item is edited in place and the page draws what was stored", async () => {
  get.mockImplementation(() => Promise.resolve(EDITABLE));
  const stored: Roadmap = {
    ...EDITABLE,
    revision: 1,
    items: EDITABLE.items.map((i) =>
      i.id === "apk" ? { ...i, end: "2026-11-20" } : i
    ),
  };
  put.mockResolvedValue(stored);
  renderPage();
  await openApk();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const form = screen.getByRole("form", { name: "Edit item" });
  expect(form).toBeTruthy();
  expect(field("Code").value).toBe("APK");
  expect(field("Tasks").value).toBe(
    "Day 1 · 6 Nov | Add the Android platform."
  );
  expect(field("Links").value).toBe(
    "Capacitor Android | https://capacitorjs.com/docs/android"
  );
  expect(screen.queryByLabelText("Id")).toBeNull(); // an item keeps its id
  fireEvent.change(field("End"), { target: { value: "2026-11-20" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  const [path, body] = put.mock.calls[0];
  expect(path).toBe("roadmap/items/apk");
  expect(body.revision).toBe(0);
  expect(body.item).toMatchObject({
    id: "apk",
    end: "2026-11-20",
    depends_on: ["t2"],
    tasks: [{ day: "Day 1 · 6 Nov", text: "Add the Android platform." }],
  });
  // Back to the detail, drawn from the answer.
  expect(
    await screen.findByRole("heading", {
      name: "Android app downloadable from the site",
    })
  ).toBeTruthy();
  expect(screen.getByText(/15 days/)).toBeTruthy();
});

test("a new item gets its id from its code and is checked before it is sent", async () => {
  get.mockImplementation(() => Promise.resolve(EDITABLE));
  post.mockImplementation(
    (_path: string, body: { item: Roadmap["items"][0] }) =>
      Promise.resolve({
        ...EDITABLE,
        revision: 1,
        items: [...EDITABLE.items, body.item],
      })
  );
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Add item" }));
  expect(screen.getByRole("form", { name: "New item" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getAllByText("Required.").length).toBeGreaterThanOrEqual(2);
  expect(post).not.toHaveBeenCalled();

  fireEvent.change(field("Code"), { target: { value: "iOS" } });
  fireEvent.change(field("Name"), { target: { value: "iPhone app" } });
  expect(field("Id").value).toBe("ios");
  fireEvent.change(field("Start"), { target: { value: "2026-11-23" } });
  fireEvent.change(field("End"), { target: { value: "2026-11-20" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByText("Ends before it starts.")).toBeTruthy();
  expect(post).not.toHaveBeenCalled();

  fireEvent.change(field("End"), { target: { value: "2026-12-04" } });
  fireEvent.change(field("Links"), { target: { value: "no bar here" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(
    screen.getByText("Every line needs a | between its two parts.")
  ).toBeTruthy();
  fireEvent.change(field("Links"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /T2/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  const [path, body] = post.mock.calls[0];
  expect(path).toBe("roadmap/items");
  expect(body).toMatchObject({
    revision: 0,
    item: {
      id: "ios",
      label: "iOS",
      track: "v4",
      status: "planned",
      start: "2026-11-23",
      end: "2026-12-04",
      depends_on: ["t2"],
      links: [],
    },
  });
  expect(
    await screen.findByRole("heading", { name: "iPhone app" })
  ).toBeTruthy();
});

test("a save someone else got in before is refused in words", async () => {
  get.mockImplementation(() => Promise.resolve(EDITABLE));
  const { OpsRequestError } = await import("@console/lib/client");
  put.mockRejectedValue(
    new OpsRequestError(409, "stale_roadmap", "the roadmap changed")
  );
  renderPage();
  await openApk();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(
    await screen.findByText(/Someone saved the roadmap after you opened it/)
  ).toBeTruthy();
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2)); // the chart reloads
});

test("an item is deleted in two steps, with the server's reason when it refuses", async () => {
  get.mockImplementation(() => Promise.resolve(EDITABLE));
  const { OpsRequestError } = await import("@console/lib/client");
  del.mockRejectedValueOnce(
    new OpsRequestError(
      409,
      "depended_on",
      "apk depend on 't2': change them first"
    )
  );
  del.mockResolvedValueOnce({
    ...EDITABLE,
    revision: 1,
    items: EDITABLE.items.filter((i) => i.id !== "apk"),
  });
  renderPage();
  await openApk();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(del).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
  expect(
    await screen.findByText(/Other items depend on this one\. apk depend on/)
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
  await waitFor(() => expect(del).toHaveBeenCalledTimes(2));
  expect(del.mock.calls[1][0]).toBe("roadmap/items/apk?revision=0");
  expect(await screen.findByText(/Pick an item on the chart/)).toBeTruthy();
});

test("milestones are moved and added from their card", async () => {
  get.mockImplementation(() => Promise.resolve(EDITABLE));
  put.mockImplementation((_p: string, body: { milestone: unknown }) =>
    Promise.resolve({ ...EDITABLE, revision: 1, milestones: [body.milestone] })
  );
  post.mockImplementation((_p: string, body: { milestone: unknown }) =>
    Promise.resolve({
      ...EDITABLE,
      revision: 1,
      milestones: [...(EDITABLE.milestones ?? []), body.milestone],
    })
  );
  renderPage();
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit Phone app on the site" })
  );
  fireEvent.change(field("Date"), { target: { value: "2026-11-20" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  expect(put.mock.calls[0][0]).toBe("roadmap/milestones/m-apk");
  expect(put.mock.calls[0][1]).toMatchObject({
    revision: 0,
    milestone: { id: "m-apk", date: "2026-11-20", track: "mobile" },
  });
  await waitFor(() =>
    expect(screen.queryByRole("form", { name: "Edit milestone" })).toBeNull()
  );

  fireEvent.click(screen.getByRole("button", { name: "Add milestone" }));
  fireEvent.change(field("Milestone"), { target: { value: "iOS beta" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  expect(post.mock.calls[0]).toEqual([
    "roadmap/milestones",
    {
      revision: 1, // the revision the first save answered with
      milestone: {
        id: "m-ios-beta",
        track: "v4",
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        name: "iOS beta",
        status: "planned",
      },
    },
  ]);
});
