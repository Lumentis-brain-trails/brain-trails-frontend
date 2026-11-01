import { renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { JOIN_TOKEN_KEY, forgetJoinToken, useJoinToken } from "./joinToken";

let query = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(query),
}));

afterEach(() => {
  window.sessionStorage.clear();
  query = "";
});

test("a token read from the link leaves the address bar for this tab's storage", () => {
  query = `token=${"t".repeat(32)}`;
  window.history.replaceState(null, "", `/join?${query}`);
  const { result } = renderHook(() => useJoinToken());
  expect(result.current).toEqual({ token: "t".repeat(32), ready: true });
  expect(window.location.pathname + window.location.search).toBe("/join");
  expect(window.sessionStorage.getItem(JOIN_TOKEN_KEY)).toBe("t".repeat(32));
});

test("back from sign-in, the kept token is found; once used it is forgotten", () => {
  window.sessionStorage.setItem(JOIN_TOKEN_KEY, "k".repeat(32));
  const { result } = renderHook(() => useJoinToken());
  expect(result.current).toEqual({ token: "k".repeat(32), ready: true });
  forgetJoinToken();
  expect(window.sessionStorage.getItem(JOIN_TOKEN_KEY)).toBeNull();
});

test("no token anywhere is an empty one, known at once", () => {
  const { result } = renderHook(() => useJoinToken());
  expect(result.current).toEqual({ token: "", ready: true });
});
