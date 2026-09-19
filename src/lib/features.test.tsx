import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useFeature } from "./features";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function serveConfig(status: number, features: Record<string, boolean>) {
  const spy = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify({ env: "test", version: "x", features }), {
        status,
        headers: { "Content-Type": "application/json" },
      })
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe("useFeature", () => {
  test("reports a flag the backend switched on", async () => {
    const spy = serveConfig(200, { run_capture: true, builder: false });
    const { result } = renderHook(() => useFeature("run_capture"), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
    expect(spy.mock.calls[0][0]).toBe("/api/backend/config");
  });

  test("is false for a flag that is off", async () => {
    serveConfig(200, { run_capture: true, builder: false });
    const { result } = renderHook(() => useFeature("builder"), { wrapper });
    await waitFor(() => expect(result.current).toBe(false));
  });

  test("is false while loading and when the request fails", async () => {
    serveConfig(500, {});
    const { result } = renderHook(() => useFeature("run_capture"), { wrapper });
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(false));
  });
});
