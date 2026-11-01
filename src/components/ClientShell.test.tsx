import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, test, vi } from "vitest";
import messages from "../../messages/en.json";
import { ClientShell } from "./ClientShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/my",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
const consent = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    get: async (path: string) =>
      path === "auth/me/consent"
        ? consent()
        : { email: "pat@example.com", role: "user", shell: "client" },
    logout: async () => {},
    put: async () => {},
  },
}));

afterEach(cleanup);

function renderShell() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <ClientShell>
          <p>my sessions</p>
        </ClientShell>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}

const agreed = (core: string, current: string) => ({
  core_version: core,
  current_version: current,
  core_at: "2026-09-22T00:00:00Z",
  research: false,
  research_at: null,
  research_version: null,
});

test("a patient under an outdated consent sees the privacy note, not their sessions", async () => {
  consent.mockResolvedValue(agreed("2026-09-22", "2026-10-20"));
  renderShell();
  expect(
    await screen.findByText(messages.shell.policyUpdate.title)
  ).toBeTruthy();
  expect(screen.queryByText("my sessions")).toBeNull();
});

test("an agreed consent shows /my as it is", async () => {
  consent.mockResolvedValue(agreed("2026-10-20", "2026-10-20"));
  renderShell();
  expect(await screen.findByText("my sessions")).toBeTruthy();
  expect(screen.queryByText(messages.shell.policyUpdate.title)).toBeNull();
});
