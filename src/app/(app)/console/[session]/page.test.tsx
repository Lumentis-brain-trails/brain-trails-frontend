import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { Suspense } from "react";
import { afterEach, expect, test, vi } from "vitest";
import messages from "../../../../../messages/en.json";
import { channelName } from "@/lib/console/channel";
import ConsolePage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    get: (p: string) => get(p),
    post: (p: string, b: unknown) => post(p, b),
  },
}));

afterEach(() => {
  cleanup();
  get.mockReset();
  post.mockReset();
});

const tree = {
  schema: 1,
  manifest: {},
  root: {
    type: "sequence",
    children: [
      {
        type: "block",
        id: "rest",
        kind: "rest",
        label: "Rest",
        config: { duration_s: 5 },
      },
    ],
  },
};

const protocol = {
  id: "p1",
  workspace_id: "w1",
  slug: "rest",
  title: "Quiet rest",
  summary: null,
  cover_url: null,
  preview_url: null,
  visibility: "workspace",
  access: "open",
  review_state: "none",
  tags: [],
  language: null,
  current_version: 1,
  est_duration_s: 5,
  content_warning: null,
  mine: true,
  archived: false,
  created_at: "2026-10-15T00:00:00Z",
  description: null,
  outline: [{ kind: "rest", label: "Rest", count: 1, duration_s: 5 }],
  definition: tree,
  draft: tree,
  draft_rev: 1,
};

function serve(consoleOn: boolean, extra: Record<string, unknown> = {}) {
  get.mockImplementation((path: string) =>
    path === "config"
      ? Promise.resolve({
          env: "test",
          version: "x",
          features: { console: consoleOn },
        })
      : Promise.resolve({ ...protocol, ...extra })
  );
}

async function renderPage(search: { protocol?: string } = { protocol: "p1" }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <QueryClientProvider client={client}>
          <Suspense fallback="loading">
            <ConsolePage
              params={Promise.resolve({ session: "run-1" })}
              searchParams={Promise.resolve(search)}
            />
          </Suspense>
        </QueryClientProvider>
      </NextIntlClientProvider>
    );
  });
}

test("the console stays hidden while its flag is off", async () => {
  serve(false);
  await renderPage();
  expect(
    await screen.findByText(messages.console.unavailable)
  ).toBeInTheDocument();
  expect(get).not.toHaveBeenCalledWith("protocols/p1");
});

test("a protocol with visual blocks opens on the photosensitivity warning", async () => {
  serve(true, { photosensitive: true });
  await renderPage();
  expect(
    await screen.findByRole("alert", {
      name: messages.run.photosensitivity.title,
    })
  ).toBeInTheDocument();
  const accept = screen.getByRole("button", {
    name: messages.run.consent.accept,
  });
  expect(accept).toBeDisabled();
  fireEvent.click(
    screen.getByRole("checkbox", { name: messages.run.photosensitivity.agree })
  );
  fireEvent.click(accept);
  expect(
    await screen.findByText(messages.console.participant.notConnected)
  ).toBeInTheDocument();
});

test("without a protocol there is nothing to run", async () => {
  serve(true);
  await renderPage({});
  expect(
    await screen.findByText(messages.console.noProtocol)
  ).toBeInTheDocument();
});

test("behind the flag: the pre-flight waits for the participant's window", async () => {
  serve(true);
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  await renderPage();
  expect(await screen.findByText("Quiet rest")).toBeInTheDocument();
  expect(
    screen.getByText(messages.console.participant.notConnected)
  ).toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", { name: messages.console.participant.open })
  );
  expect(open).toHaveBeenCalledWith(
    "/run/run-1",
    "bt-run-run-1",
    expect.stringContaining("popup")
  );

  // Start before the participant's window answered: no session is opened
  fireEvent.click(
    await screen.findByRole(
      "button",
      { name: messages.run.preflight.connect },
      { timeout: 5000 }
    )
  );
  await screen.findByText(/Connected to/, {}, { timeout: 5000 });
  const override = screen.queryByLabelText(messages.run.preflight.override);
  if (override) fireEvent.click(override);
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: messages.run.preflight.start })
    );
  });
  expect(
    screen.getByText(messages.console.openParticipantFirst)
  ).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();

  // the participant's window says hello over the run's channel
  const participant = new BroadcastChannel(channelName("run-1"));
  participant.postMessage({ type: "hello" });
  await waitFor(() =>
    expect(
      screen.getByText(messages.console.participant.connected)
    ).toBeInTheDocument()
  );
  participant.close();
  open.mockRestore();
});
