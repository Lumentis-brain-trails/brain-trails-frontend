import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { Suspense } from "react";
import { afterEach, expect, test, vi } from "vitest";
import messages from "../../../../../../messages/en.json";
import MyResultsPage from "./page";

const get = vi.fn();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p) },
}));
afterEach(() => cleanup());

test("results not shared in full say so, and ask for nothing else", async () => {
  const { ApiRequestError } = await import("@/lib/api");
  get.mockRejectedValue(
    new ApiRequestError(404, { code: "not_found", message: "x" })
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <QueryClientProvider client={client}>
          <Suspense fallback="loading">
            <MyResultsPage params={Promise.resolve({ recording: "r1" })} />
          </Suspense>
        </QueryClientProvider>
      </NextIntlClientProvider>
    );
  });
  expect(
    await screen.findByText(messages.therapy.results.notShared)
  ).toBeTruthy();
  expect(get).toHaveBeenCalledWith("recordings/r1/analysis");
  expect(get).toHaveBeenCalledTimes(1);
});
