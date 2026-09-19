import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AppShell, isCurrentSection } from "./AppShell";

const pathname = vi.fn(() => "/");
vi.mock("next/navigation", () => ({
  usePathname: () => pathname(),
  useRouter: () => ({ push: vi.fn() }),
}));
const me = vi.fn(async () => ({ email: "ada@lab.org", role: "user" }));
vi.mock("@/lib/api", () => ({
  api: { get: () => me(), logout: async () => {} },
}));

function renderAt(path: string) {
  pathname.mockReturnValue(path);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AppShell>
        <p>page</p>
      </AppShell>
    </QueryClientProvider>
  );
}

// Vitest runs without globals here, so React Testing Library's own cleanup
// hook is never registered and renders would stack up.
afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.dataset.theme = "light";
});

const current = () =>
  screen
    .getAllByRole("link")
    .filter((a) => a.getAttribute("aria-current") === "page")
    .map((a) => a.textContent);

test("a section owns its subpaths, not every href it starts with", () => {
  expect(isCurrentSection("/recordings", "/record")).toBe(false);
  expect(isCurrentSection("/record", "/record")).toBe(true);
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
