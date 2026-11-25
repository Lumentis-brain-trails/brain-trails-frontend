import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { IntlEn } from "@/i18n/testing";
import { api } from "@/lib/api";
import { RoundsCard, type Rounds } from "./RoundsCard";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: vi.fn() },
}));

function mount(rounds: Rounds) {
  vi.mocked(api.get).mockResolvedValue(rounds);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <IntlEn>
      <QueryClientProvider client={client}>
        <RoundsCard recordingId="r1" />
      </QueryClientProvider>
    </IntlEn>
  );
}

beforeEach(() => vi.clearAllMocks());

test("each round's light, the rest after it and the level; then first against last", async () => {
  mount({
    rounds: [
      {
        game: "g#0",
        in_target_share: 0.62,
        transfer: 0.4,
        level: 1,
        next_level: 2,
      },
      {
        game: "g#1",
        in_target_share: 0.7,
        transfer: null,
        level: 2,
        next_level: 2,
      },
    ],
    first_vs_last: {
      first: { key: "pre#0", share: 0.3 },
      last: { key: "map#1", share: 0.45 },
    },
  });
  expect(await screen.findByText("Rounds")).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith("recordings/r1/rounds");
  expect(screen.getByText("62%")).toBeInTheDocument();
  expect(screen.getByText("40%")).toBeInTheDocument();
  expect(screen.getByText("not yet")).toBeInTheDocument();
  expect(screen.getByText("1 → 2")).toBeInTheDocument();
  expect(
    screen.getByText(/30% of the first rest, 45% of the last/)
  ).toBeInTheDocument();
});

test("a session without a game shows nothing", async () => {
  const { container } = mount({ rounds: [], first_vs_last: null });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(container.textContent).toBe("");
});
