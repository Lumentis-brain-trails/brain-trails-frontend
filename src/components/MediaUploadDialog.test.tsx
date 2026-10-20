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
import { fakeWorkspaceApi } from "@/test/workspaceApi";
import { MediaUploadDialog } from "./MediaUploadDialog";

const fake = vi.hoisted(() => ({
  api: null as unknown as ReturnType<typeof fakeWorkspaceApi>,
}));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    get: (path: string) => fake.api.get(path),
    post: (path: string, body: unknown) => fake.api.post(path, body),
  },
}));
vi.mock("@/components/Toast", () => ({ useToast: () => vi.fn() }));

afterEach(cleanup);

test("an upload waits for the workspace, then presigns in the clinic", async () => {
  fake.api = fakeWorkspaceApi();
  // the presign answers; the rest of the upload is not this test's business
  fake.api.post.mockImplementation(async () => {
    throw new Error("stop after the presign");
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { container } = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <MediaUploadDialog onClose={() => {}} />
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
  const input = container.querySelector(
    'input[type="file"]'
  ) as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: [new File(["x"], "clip.mp4", { type: "video/mp4" })] },
  });
  const add = screen.getByRole("button", { name: "Add to library" });
  expect((add as HTMLButtonElement).disabled).toBe(true); // flags unknown
  await act(async () => fake.api.answerConfig());
  await vi.waitFor(() =>
    expect((add as HTMLButtonElement).disabled).toBe(false)
  );
  fireEvent.click(add);
  await vi.waitFor(() => expect(fake.api.post).toHaveBeenCalledOnce());
  expect(fake.api.post.mock.calls[0][0]).toBe("media/uploads?workspace=c1");
});
