import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api";
import { SUBJECTS_QUERY_KEY, subjectQueryKey } from "@/lib/subjects";
import { resultsUnavailable, useShare } from "./therapy";

const put = vi.fn();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { put: (p: string, b: unknown) => put(p, b) },
}));

describe("useShare", () => {
  it("refreshes the patient page's subject and the timeline, not other subjects", async () => {
    put.mockResolvedValue({ share_results: "full" });
    const client = new QueryClient();
    client.setQueryData(subjectQueryKey("p1"), { share_results: "nothing" });
    client.setQueryData(subjectQueryKey("p2"), { share_results: "nothing" });
    client.setQueryData(["timeline", "p1", 8], { share_results: "nothing" });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useShare("p1"), { wrapper });
    await act(() => result.current.mutateAsync("full"));

    expect(put).toHaveBeenCalledWith("subjects/p1/share", { level: "full" });
    expect(client.getQueryState(subjectQueryKey("p1"))?.isInvalidated).toBe(
      true
    );
    expect(client.getQueryState(["timeline", "p1", 8])?.isInvalidated).toBe(
      true
    );
    expect(client.getQueryState(subjectQueryKey("p2"))?.isInvalidated).toBe(
      false
    );
  });

  it("keys a subject's page under the roster's key", () => {
    expect(subjectQueryKey("p1")).toEqual([SUBJECTS_QUERY_KEY, "one", "p1"]);
  });
});

describe("resultsUnavailable", () => {
  const failed = (status: number) =>
    new ApiRequestError(status, { code: "x", message: "x" });

  it("says not shared only when the API refuses or hides the recording", () => {
    expect(resultsUnavailable(failed(403))).toBe("notShared");
    expect(resultsUnavailable(failed(404))).toBe("notShared");
  });

  it("tells a recording still in analysis from a failure", () => {
    expect(resultsUnavailable(failed(409))).toBe("notReady");
    expect(resultsUnavailable(failed(500))).toBe("loadFailed");
    expect(resultsUnavailable(new TypeError("fetch failed"))).toBe(
      "loadFailed"
    );
  });
});
