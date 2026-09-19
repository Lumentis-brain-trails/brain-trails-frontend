import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SIGNAL_NAVIGATOR } from "./definitions/signalNavigator";
import { finishSession, resolveProtocol, startSession } from "./session";
import "@/components/protocol/kinds";

const post = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    post: (path: string, body: unknown) => post(path, body),
  },
  ApiRequestError: class extends Error {},
}));

beforeEach(() => post.mockReset().mockResolvedValue({}));
afterEach(() => vi.clearAllMocks());

describe("startSession", () => {
  test("posts the media id and defaults the device", async () => {
    await startSession("media-1");

    expect(post).toHaveBeenCalledWith("sessions", {
      media_id: "media-1",
      device: "muse-2",
      params: {},
    });
  });

  test("passes a title and params through when given", async () => {
    await startSession("media-1", {
      title: "Signal Navigator",
      params: { protocol_id: "signal-navigator", protocol_version: 1 },
    });

    expect(post.mock.calls[0][1]).toEqual({
      media_id: "media-1",
      title: "Signal Navigator",
      device: "muse-2",
      params: { protocol_id: "signal-navigator", protocol_version: 1 },
    });
  });

  /**
   * `task_label` is a closed CHECK constraint in SQL with no go/no-go value, so sending
   * one would fail at the database rather than at the API.
   */
  test("never sends a task label", async () => {
    await startSession("media-1", { title: "x" });
    expect(post.mock.calls[0][1]).not.toHaveProperty("task_label");
  });
});

describe("finishSession", () => {
  test("closes a completed run with its summary", async () => {
    await finishSession("sess-1", { challenge_a: { hitRate: 0.9 } }, false);

    expect(post).toHaveBeenCalledWith("sessions/sess-1/finish", {
      summary: { challenge_a: { hitRate: 0.9 } },
      aborted: false,
    });
  });

  test("marks an abandoned run aborted", async () => {
    await finishSession("sess-1", {}, true);
    expect(post.mock.calls[0][1]).toEqual({ summary: {}, aborted: true });
  });
});

describe("resolveProtocol", () => {
  test("resolves a module this build ships", () => {
    const resolved = resolveProtocol("signal-navigator-v1", {});
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.protocol.id).toBe(SIGNAL_NAVIGATOR.id);
  });

  test("accepts the protocol's own id as a module name", () => {
    const resolved = resolveProtocol("signal-navigator", {});
    expect(resolved.ok).toBe(true);
  });

  test("reports an unknown module as needing a newer build", () => {
    const resolved = resolveProtocol("tetris-v9", {});
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.error).toMatch(/no protocol module/i);
  });

  test("the module wins when a definition is also present", () => {
    const resolved = resolveProtocol("signal-navigator-v1", {
      id: "something-else",
      version: 1,
      title: "Other",
      steps: [],
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.protocol.id).toBe("signal-navigator");
  });

  test("falls back to a carried definition when there is no module", () => {
    const resolved = resolveProtocol(null, {
      id: "inline",
      version: 2,
      title: "Inline protocol",
      steps: [
        {
          id: "only",
          kind: "prompt",
          label: "Only",
          config: {
            lines: [{ text: "Hello", holdMs: 100 }],
            advance: { mode: "timed", ms: 500 },
          },
        },
      ],
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.protocol.title).toBe("Inline protocol");
  });

  /** A catalog row is server data; running it unvalidated pushes a bad step into a renderer. */
  test("rejects a malformed carried definition rather than running it", () => {
    const resolved = resolveProtocol(null, {
      id: "broken",
      version: 1,
      title: "Broken",
      steps: [{ id: "x", kind: "prompt", label: "X", config: {} }],
    });
    expect(resolved.ok).toBe(false);
  });

  test("reports an item that carries neither a module nor a definition", () => {
    const resolved = resolveProtocol(null, {});
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.error).toMatch(/neither a module/i);
  });
});
