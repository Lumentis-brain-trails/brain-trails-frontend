import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { IntlEn, IntlIt } from "@console/i18n/testing";
import { FairSection as AdminFairPage } from "./Fair";

const get = vi.fn();
vi.mock("@console/lib/product", async (orig) => ({
  ...(await orig<typeof import("@console/lib/product")>()),
  api: {
    get: (path: string) => get(path),
    put: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

function person(
  id: string,
  state: "waiting" | "called" | "done" | "declined",
  extra: Record<string, unknown> = {}
) {
  return {
    user_id: id,
    email: `${id}@example.com`,
    full_name: null,
    state,
    signed_up_at: ago(5),
    called_at: null,
    wants_beta: false,
    ...extra,
  };
}

function renderPage(Intl: typeof IntlEn = IntlEn) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <Intl>
      <QueryClientProvider client={client}>
        <AdminFairPage />
      </QueryClientProvider>
    </Intl>
  );
}

beforeEach(() => {
  get.mockImplementation((path: string) =>
    Promise.resolve(
      path === "admin/fair"
        ? { enabled: true, waiting: 2, called: 1, done: 2, declined: 1 }
        : [
            person("new", "waiting", { signed_up_at: ago(0) }),
            person("ada", "waiting"),
            person("bo", "called", {
              signed_up_at: ago(180),
              called_at: ago(3),
            }),
            person("old", "called"),
            person("cy", "done", { wants_beta: true }),
            person("di", "done"),
            person("ed", "declined"),
          ]
    )
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("the queue says how long ago each person signed up and was called", async () => {
  renderPage();
  expect(
    await screen.findByText("new@example.com · signed up just now")
  ).toBeTruthy();
  expect(
    screen.getByText("ada@example.com · signed up 5 min ago")
  ).toBeTruthy();
  expect(screen.getByText("bo@example.com · signed up 3 h ago")).toBeTruthy();
  expect(screen.getByText("called 3 min ago")).toBeTruthy();
  // Called, but the time was never stored: the word alone.
  expect(screen.getByText("called")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Call again" })).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "Call" })).toHaveLength(2);
});

test("the stand's state, its conversion and the people seen to", async () => {
  renderPage();
  expect(await screen.findByText("The stand is open.")).toBeTruthy();
  expect(
    screen.getByText(
      "1 of 2 who tried the headband asked to be beta testers (50%)."
    )
  ).toBeTruthy();
  expect(screen.getByText("Seen to")).toBeTruthy();
  expect(screen.getAllByText("done")).toHaveLength(2);
  expect(screen.getByText("not any more")).toBeTruthy();
  // The dot: once in the conversion line, once beside the person who asked.
  expect(screen.getAllByLabelText("Asked to be a beta tester")).toHaveLength(2);
});

test("the same sentences in Italian", async () => {
  renderPage(IntlIt);
  expect(
    await screen.findByText("ada@example.com · iscrizione 5 min fa")
  ).toBeTruthy();
  expect(screen.getByText("new@example.com · iscrizione adesso")).toBeTruthy();
  expect(screen.getByText("chiamato 3 min fa")).toBeTruthy();
  expect(screen.getByText("chiamato")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Assente" })).toHaveLength(4);
});
