import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import messages from "../../messages/en.json";
import { AppShell, isCurrentSection, sectionsFor } from "./AppShell";
import { SELECTED_WORKSPACE_KEY, resetPinnedWorkspace } from "@/lib/workspace";
import { LANDSCAPE_SEEN_KEY } from "@/lib/landscapeStatus";

const pathname = vi.fn(() => "/");
vi.mock("next/navigation", () => ({
  usePathname: () => pathname(),
  useRouter: () => ({ push: vi.fn() }),
}));
const me = vi.fn(async () => ({ email: "ada@lab.org", role: "user" }));
const landscapeStatus = vi.fn(async () => ({
  epoch: null as number | null,
  built_at: null,
  pending: false,
}));
const features = vi.fn(async () => ({
  features: {} as Record<string, boolean>,
}));
const workspaces = vi.fn(async () => [
  {
    id: "p",
    kind: "personal",
    name: "Personal",
    status: "active",
    relations: ["owner"],
  },
]);
vi.mock("@/lib/api", () => ({
  api: {
    get: (path: string) =>
      path === "landscape/status"
        ? landscapeStatus()
        : path === "config"
          ? features()
          : path === "workspaces"
            ? workspaces()
            : me(),
    logout: async () => {},
  },
}));

function renderAt(path: string) {
  pathname.mockReturnValue(path);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <AppShell>
          <p>page</p>
        </AppShell>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}

// Vitest runs without globals here, so React Testing Library's own cleanup
// hook is never registered and renders would stack up.
afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
  resetPinnedWorkspace();
  document.documentElement.dataset.theme = "light";
});

const current = () =>
  screen
    .getAllByRole("link")
    .filter((a) => a.getAttribute("aria-current") === "page")
    .map((a) => a.textContent);

test("a section owns its subpaths, not every href it starts with", () => {
  expect(isCurrentSection("/recordings", "/media")).toBe(false);
  expect(isCurrentSection("/media", "/media")).toBe(true);
  expect(isCurrentSection("/recordings/abc", "/recordings")).toBe(true);
});

test("marks only the section being viewed", () => {
  renderAt("/recordings/abc-123");
  expect(current()).toEqual(["Recordings"]);
});

test("shows Admin only to administrators", async () => {
  me.mockResolvedValueOnce({ email: "root@lab.org", role: "admin" });
  renderAt("/admin");
  expect(await screen.findByRole("link", { name: "Admin" })).toBeTruthy();
  expect(current()).toEqual(["Admin"]);
});

test("the appearance switch flips the document theme and remembers it", async () => {
  renderAt("/home");
  fireEvent.click(screen.getByRole("button", { name: "Dark appearance" }));
  await act(() => Promise.resolve());
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(window.localStorage.getItem("bt-theme")).toBe("dark");
  expect(screen.getByRole("button", { name: "Light appearance" })).toBeTruthy();
});

test("the drawer opens from the top bar and closes on Escape", () => {
  renderAt("/home");
  const aside = screen.getByRole("complementary", { name: "Sections" });
  expect(aside.dataset.open).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
  expect(aside.dataset.open).toBe("true");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(aside.dataset.open).toBe("false");
});

test("the Brain Landscape is marked when its map was redrawn since last seen", async () => {
  landscapeStatus.mockResolvedValue({
    epoch: 2,
    built_at: null,
    pending: false,
  });
  renderAt("/home");
  expect(
    await screen.findByRole("link", { name: "Brain Landscape · Redrawn" })
  ).toBeTruthy();
  cleanup();

  window.localStorage.setItem(LANDSCAPE_SEEN_KEY, "2");
  renderAt("/home");
  await act(() => Promise.resolve());
  expect(screen.getByRole("link", { name: "Brain Landscape" })).toBeTruthy();
  landscapeStatus.mockResolvedValue({
    epoch: null,
    built_at: null,
    pending: false,
  });
});

test("an organisation's rail has its people and no personal map", () => {
  const keys = (e: Parameters<typeof sectionsFor>[0]) =>
    sectionsFor(e).map((s) => s.key);
  expect(keys("personal")).toContain("landscape");
  expect(keys("personal")).not.toContain("people");
  expect(keys("therapy")).toEqual([
    "home",
    "protocols",
    "media",
    "recordings",
    "people",
  ]);
  expect(keys("research")).toEqual(keys("therapy"));
});

test("with organisations on, the switcher shows the chosen clinic", async () => {
  features.mockResolvedValue({ features: { workspaces_multi: true } });
  workspaces.mockResolvedValue([
    {
      id: "p",
      kind: "personal",
      name: "Personal",
      status: "active",
      relations: ["owner"],
    },
    {
      id: "c",
      kind: "practice",
      name: "Studio Uno",
      status: "active",
      relations: ["member"],
    },
  ]);
  window.localStorage.setItem(SELECTED_WORKSPACE_KEY, "c");
  renderAt("/home");
  expect(await screen.findByRole("link", { name: "People" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Brain Landscape" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Change workspace/ }));
  expect(
    screen.getByRole("menuitemradio", { name: /Clinic · Member/ })
  ).toBeTruthy();
  features.mockResolvedValue({ features: {} });
  workspaces.mockResolvedValue([
    {
      id: "p",
      kind: "personal",
      name: "Personal",
      status: "active",
      relations: ["owner"],
    },
  ]);
});
