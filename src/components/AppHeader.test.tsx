import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, test, vi } from "vitest";
import { AppHeader } from "./AppHeader";

const pathname = vi.fn(() => "/");
vi.mock("next/navigation", () => ({
  usePathname: () => pathname(),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  api: { get: async () => ({}), logout: async () => {} },
}));

function renderAt(path: string) {
  pathname.mockReturnValue(path);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AppHeader />
    </QueryClientProvider>
  );
}

// Vitest runs without globals here, so React Testing Library's own cleanup
// hook is never registered and renders would stack up.
afterEach(cleanup);

/** The pill is duplicated in the wide and the narrow nav; both must agree. */
const current = () =>
  screen
    .getAllByRole("link")
    .filter((a) => a.getAttribute("aria-current") === "page")
    .map((a) => a.textContent);

test("marks only the section being viewed, not every href it starts with", () => {
  // /recordings starts with /record, which used to light both pills up.
  renderAt("/recordings");
  expect(current()).toEqual(["Recordings", "Recordings"]);
});

test("marks Record on the record page", () => {
  renderAt("/record");
  expect(current()).toEqual(["Record", "Record"]);
});

test("keeps the section marked on a page below it", () => {
  renderAt("/recordings/abc-123");
  expect(current()).toEqual(["Recordings", "Recordings"]);
});
