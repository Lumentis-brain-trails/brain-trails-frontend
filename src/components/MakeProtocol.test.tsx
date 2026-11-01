import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, test, vi } from "vitest";
import messages from "../../messages/en.json";
import type { Media } from "@/lib/types";
import { fakeWorkspaceApi } from "@/test/workspaceApi";
import { MakeProtocol } from "./MakeProtocol";

const fake = vi.hoisted(() => ({
  api: null as unknown as ReturnType<typeof fakeWorkspaceApi>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    get: (path: string) => fake.api.get(path),
    post: (path: string, body: unknown) => fake.api.post(path, body),
  },
}));

afterEach(cleanup);

test("a protocol made from media waits for the workspace, then files into the clinic", async () => {
  fake.api = fakeWorkspaceApi();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <MakeProtocol
          item={{ id: "m1", kind: "video", status: "ready" } as Media}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
  const button = screen.getByRole("button", { name: "Create a protocol" });
  expect((button as HTMLButtonElement).disabled).toBe(true); // flags unknown
  await act(async () => fake.api.answerConfig());
  await vi.waitFor(() =>
    expect((button as HTMLButtonElement).disabled).toBe(false)
  );
  fireEvent.click(button);
  await vi.waitFor(() => expect(fake.api.post).toHaveBeenCalledOnce());
  expect(fake.api.post.mock.calls[0][0]).toBe(
    "protocols/from-media/m1?workspace=c1"
  );
});
