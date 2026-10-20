/**
 * A fake BFF for tests of saves that must name the current workspace (frontend #142).
 *
 * `GET /config` answers when the test calls `answerConfig`, so a test can prove a save
 * waits for the flags; `GET /workspaces` lists a personal workspace and a clinic, and
 * the clinic is the one chosen.
 */
import { vi } from "vitest";
import { resetPinnedWorkspace, selectWorkspace } from "@/lib/workspace";

export const PERSONAL = {
  id: "w1",
  kind: "personal",
  name: "Personal",
  status: "active",
  relations: ["owner"],
};
export const CLINIC = {
  id: "c1",
  kind: "practice",
  name: "Studio Uno",
  status: "active",
  relations: ["member"],
};

export function fakeWorkspaceApi(extra: Record<string, unknown> = {}) {
  let answer: (value: unknown) => void = () => {};
  const config = new Promise((resolve) => (answer = resolve));
  const get = vi.fn(async (path: string) =>
    path === "config"
      ? config
      : path === "workspaces"
        ? [PERSONAL, CLINIC]
        : (extra[path] ?? [])
  );
  // typed with the path and body, which the tests read back from `post.mock.calls`
  const post = vi.fn<(path: string, body?: unknown) => Promise<unknown>>(
    async () => ({ id: "new-1" })
  );
  resetPinnedWorkspace();
  selectWorkspace(CLINIC.id);
  return {
    get,
    post,
    answerConfig: () => answer({ features: { workspaces_multi: true } }),
  };
}
