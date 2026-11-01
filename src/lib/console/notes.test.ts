import { afterEach, describe, expect, test, vi } from "vitest";
import { NOTE_MAX_CHARS, liveNoteBody, saveLiveNote } from "./notes";

const post = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { post: (path: string, body: unknown) => post(path, body) },
}));

afterEach(() => post.mockReset());

describe("live notes", () => {
  test("a note is an instant on the session clock, at the second typing began", () => {
    expect(liveNoteBody({ body: "  jaw clench  ", tStartS: 41.23456 })).toEqual(
      {
        kind: "instant",
        body: "jaw clench",
        t_start_s: 41.235,
      }
    );
  });

  test("a note begun before the first sample is about the start", () => {
    expect(liveNoteBody({ body: "early", tStartS: -0.4 })?.t_start_s).toBe(0);
  });

  test("an empty note is nothing to save", async () => {
    expect(liveNoteBody({ body: "   ", tStartS: 3 })).toBeNull();
    expect(await saveLiveNote("r1", { body: "", tStartS: 3 })).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  test("a long note is cut to what the backend stores", () => {
    const body = liveNoteBody({
      body: "a".repeat(NOTE_MAX_CHARS + 10),
      tStartS: 1,
    });
    expect(body?.body).toHaveLength(NOTE_MAX_CHARS);
  });

  test("saves on the session's recording", async () => {
    post.mockResolvedValue({});
    expect(await saveLiveNote("r1", { body: "blink", tStartS: 12 })).toBe(true);
    expect(post).toHaveBeenCalledWith("recordings/r1/annotations", {
      kind: "instant",
      body: "blink",
      t_start_s: 12,
    });
  });
});
