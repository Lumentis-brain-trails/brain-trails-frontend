import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { Suspense } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import messages from "../../../../../../messages/en.json";
import BuilderPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const get = vi.fn();
const put = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    get: (path: string) => get(path),
    put: (path: string, body: unknown, options: unknown) =>
      put(path, body, options),
    post: (path: string, body: unknown) => post(path, body),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

const tree = {
  schema: 1,
  manifest: {},
  root: {
    type: "sequence",
    order: "fixed",
    children: [
      {
        type: "block",
        id: "rest",
        kind: "rest",
        label: "Rest",
        config: { mode: "timed", duration_s: 30 },
      },
    ],
  },
};

const protocol = {
  id: "p1",
  workspace_id: "w1",
  slug: "mine",
  title: "My protocol",
  summary: null,
  cover_url: null,
  preview_url: null,
  visibility: "workspace",
  access: "open",
  review_state: "none",
  tags: [],
  language: null,
  current_version: null,
  est_duration_s: null,
  content_warning: null,
  mine: true,
  archived: false,
  created_at: "2026-09-20T00:00:00Z",
  description: null,
  outline: [],
  definition: null,
  draft: tree,
  draft_rev: 3,
};

beforeEach(() => {
  get
    .mockReset()
    .mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith("protocols/")
          ? protocol
          : path === "workspaces"
            ? []
            : []
      )
    );
  put.mockReset().mockResolvedValue({ draft_rev: 4 });
  post.mockReset().mockResolvedValue({
    ok: true,
    errors: [],
    warnings: [],
    est_duration_s: 30,
  });
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

/** Renders and waits for the server's draft to land on the timeline. */
async function renderBuilder() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <QueryClientProvider client={client}>
          <Suspense fallback="loading">
            <BuilderPage params={Promise.resolve({ id: "p1" })} />
          </Suspense>
        </QueryClientProvider>
      </NextIntlClientProvider>
    );
  });
  await within(await screen.findByTestId("timeline")).findAllByText("Rest"); // the clip's name and its kind
}

/** The monitor names the selected block too, so the timeline is asked on its own. */
const onTimeline = () => within(screen.getByTestId("timeline"));

function drop(index: number, payload: unknown) {
  const data = new Map<string, string>();
  fireEvent.drop(screen.getByTestId(`gap-${index}`), {
    dataTransfer: {
      setData: (type: string, value: string) => data.set(type, value),
      getData: () => JSON.stringify(payload),
    },
  });
}

test("the draft loads onto the timeline and an element can be dropped in", async () => {
  await renderBuilder();
  await act(async () => {
    drop(1, { from: "bin-element", value: "baseline" });
  });
  expect(onTimeline().getByText("Resting baseline")).toBeTruthy();
});

test("an edit autosaves once, naming the revision it started from", async () => {
  await renderBuilder();
  await act(async () => {
    drop(1, { from: "bin-element", value: "countdown" });
  });
  expect(put).not.toHaveBeenCalled(); // debounced

  await act(async () => {
    vi.advanceTimersByTime(1600);
  });
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  const [path, body, options] = put.mock.calls[0];
  expect(path).toBe("protocols/p1/draft");
  expect(options).toEqual({ ifMatch: 3 });
  expect(
    (
      body as { draft: { root: { children: { kind: string }[] } } }
    ).draft.root.children.map((c) => c.kind)
  ).toEqual(["rest", "countdown"]);
});

test("a draft saved elsewhere stops the autosave and offers a reload", async () => {
  const { ApiRequestError } = await import("@/lib/api");
  put.mockRejectedValue(
    new ApiRequestError(409, { code: "stale_draft", message: "changed" })
  );
  await renderBuilder();
  await act(async () => {
    drop(1, { from: "bin-element", value: "fixation" });
  });
  await act(async () => {
    vi.advanceTimersByTime(1600);
  });
  await waitFor(() =>
    expect(screen.getByText(messages.builder.reload)).toBeTruthy()
  );

  // a further edit must not be pushed over the other person's work
  put.mockClear();
  await act(async () => {
    drop(1, { from: "bin-element", value: "rest" });
    vi.advanceTimersByTime(2000);
  });
  expect(put).not.toHaveBeenCalled();
});

test("undo takes the last edit back", async () => {
  await renderBuilder();
  await act(async () => {
    drop(1, { from: "bin-element", value: "baseline" });
  });
  expect(onTimeline().getByText("Resting baseline")).toBeTruthy();
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: messages.builder.undo })
    );
  });
  expect(onTimeline().queryByText("Resting baseline")).toBeNull();
});

test("Preview on a block that cannot run lists the fault and selects the block", async () => {
  const broken = {
    ...protocol,
    draft: {
      ...tree,
      root: {
        ...tree.root,
        children: [
          ...tree.root.children,
          {
            type: "block",
            id: "instructions",
            kind: "instructions",
            label: "Read this",
            config: { lines: [{ text: "" }], advance: { mode: "key" } },
          },
        ],
      },
    },
  };
  get.mockImplementation((path: string) =>
    Promise.resolve(path.startsWith("protocols/") ? broken : [])
  );
  await renderBuilder();
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: messages.builder.preview })
    );
  });
  expect(screen.getByText(messages.builder.fix_before_preview)).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: "Block 2: Read this · row 1 · Lines · Text",
    })
  ).toBeTruthy();
  expect(screen.getByText(/"text" cannot be empty/)).toBeTruthy();
  // the runner did not open, and the faulty block is the one in the inspector
  expect(document.querySelector(".fixed.inset-0")).toBeNull();
  expect(screen.getByDisplayValue("Read this")).toBeTruthy();
  expect(post).not.toHaveBeenCalled();
});

/** The builder with nothing saved yet: `/protocols/new/edit`. */
async function renderNewBuilder() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <QueryClientProvider client={client}>
          <Suspense fallback="loading">
            <BuilderPage params={Promise.resolve({ id: "new" })} />
          </Suspense>
        </QueryClientProvider>
      </NextIntlClientProvider>
    );
  });
}

test("a new protocol is kept only once something is on its timeline", async () => {
  const created = { ...protocol, id: "p2", draft_rev: 1 };
  post.mockResolvedValue(created);
  get.mockImplementation((path: string) =>
    Promise.resolve(path === "protocols/p2" ? created : [])
  );
  await renderNewBuilder();
  expect(get).not.toHaveBeenCalledWith("protocols/new");

  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  expect(post).not.toHaveBeenCalled(); // an empty builder is not a protocol

  await act(async () => {
    drop(0, { from: "bin-element", value: "baseline" });
  });
  await act(async () => {
    vi.advanceTimersByTime(1600);
  });
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  const [path, body] = post.mock.calls[0];
  expect(path).toBe("protocols");
  expect(
    (body as { draft: { root: { children: unknown[] } } }).draft.root.children
  ).toHaveLength(1);
  // the URL follows the protocol that now exists, without reloading the builder
  expect(window.location.pathname).toBe("/protocols/p2/edit");

  // and the draft carries on with PUTs from the revision the creation returned
  await act(async () => {
    drop(0, { from: "bin-element", value: "countdown" });
  });
  await act(async () => {
    vi.advanceTimersByTime(1600);
  });
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  expect(put.mock.calls[0][0]).toBe("protocols/p2/draft");
  expect(put.mock.calls[0][2]).toEqual({ ifMatch: 1 });
});
