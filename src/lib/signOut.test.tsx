import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, test, vi } from "vitest";
import { useSignOut } from "./signOut";

const push = vi.fn();
const logout = vi.fn(async () => ({ status: "ok" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api", () => ({ api: { logout: () => logout() } }));

test("signing out forgets every cached answer before going on", async () => {
  const client = new QueryClient();
  client.setQueryData(["me"], { email: "therapist@example.com" });
  const { result } = renderHook(() => useSignOut(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await result.current();
  expect(logout).toHaveBeenCalled();
  expect(client.getQueryData(["me"])).toBeUndefined();
  expect(push).toHaveBeenCalledWith("/login");
  await result.current("/");
  expect(push).toHaveBeenLastCalledWith("/");
});
