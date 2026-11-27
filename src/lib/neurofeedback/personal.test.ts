import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiRequestError, api } from "@/lib/api";
import { neurofeedbackConfigSchema } from "@/lib/protocol/blocks";
import { protocolTreeSchema } from "@/lib/protocol/tree";
import { hasLandscapeBlock } from "./landscape";
import { resolvePlan } from "@/lib/protocol/resolve";
import {
  personalProtocol,
  roundsFor,
  saveDraft,
  storeProtocol,
  storedProtocol,
} from "./personal";

vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const texts = {
  ready: "Sit comfortably.",
  how: "Bring the plane up.",
  start: "Start",
  label: "Get ready",
  warning: "Moving images.",
  map: "Eyes on the screen",
};

test("the page's protocol is an ordinary tree with one landscape block", () => {
  const tree = personalProtocol(
    {
      targets: { points: [[1, 2]], radius: 0.5, epoch: 2, preset: "focus" },
      feedback: "tuning",
      minutes: 10,
    },
    texts
  );
  expect(protocolTreeSchema.safeParse(tree).success).toBe(true);
  expect(hasLandscapeBlock(tree)).toBe(true);
  const block = (tree.root as { children: { config?: unknown }[] }).children[1];
  const config = neurofeedbackConfigSchema.parse(block.config);
  expect(config.duration_s).toBe(600);
  expect(config.feedback).toBe("tuning");
  expect(config.threshold).toEqual({ mode: "baseline", target_fraction: 0.6 });
});

test("a game is played in rounds: a map, then the game and a map, carried", () => {
  const tree = personalProtocol(
    {
      targets: { points: [[1, 2]], radius: 0.5, epoch: 2, preset: "focus" },
      feedback: "lantern",
      minutes: 10,
    },
    texts
  );
  expect(protocolTreeSchema.safeParse(tree).success).toBe(true);
  expect(hasLandscapeBlock(tree)).toBe(true);
  const plan = resolvePlan(tree, 1, { id: "p", version: 1, title: "NF" });
  const kinds = plan.steps.map((s) => s.kind);
  // get ready, map, then three rounds of game and map
  expect(kinds).toEqual([
    "instructions",
    "baseline",
    ...Array(3).fill(["neurofeedback", "baseline"]).flat(),
  ]);
  const games = plan.steps.filter((s) => s.kind === "neurofeedback");
  for (const step of games) {
    const config = neurofeedbackConfigSchema.parse(step.config);
    expect(config.feedback).toBe("lantern");
    expect(config.threshold).toEqual({ mode: "carry", target_fraction: 0.6 });
    expect(config.duration_s).toBe(200);
  }
});

test("the chosen minutes are shared among rounds of about three minutes", () => {
  expect(roundsFor(5)).toEqual({ rounds: 2, gameS: 150 });
  expect(roundsFor(10)).toEqual({ rounds: 3, gameS: 200 });
  expect(roundsFor(15)).toEqual({ rounds: 5, gameS: 180 });
  expect(roundsFor(20)).toEqual({ rounds: 7, gameS: 171 });
});

describe("saveDraft", () => {
  const get = vi.mocked(api.get);
  const put = vi.mocked(api.put);
  const post = vi.mocked(api.post);
  const ws = { id: "w1" };

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    post.mockResolvedValue({ id: "new" });
  });

  test("updates the remembered protocol", async () => {
    storeProtocol("p1");
    get.mockResolvedValue({ id: "p1", archived: false, draft_rev: 4 });
    expect(await saveDraft({}, "NF", ws)).toBe("p1");
    expect(put).toHaveBeenCalledWith(
      "protocols/p1/draft",
      { draft: {} },
      { ifMatch: 4 }
    );
    expect(post).not.toHaveBeenCalled();
  });

  test("an archived one is replaced by a new protocol", async () => {
    storeProtocol("p1");
    get.mockResolvedValue({ id: "p1", archived: true, draft_rev: 4 });
    expect(await saveDraft({}, "NF", ws)).toBe("new");
    expect(put).not.toHaveBeenCalled();
    expect(storedProtocol()).toBe("new");
  });

  test("a gone one is replaced, a failing server is not", async () => {
    storeProtocol("p1");
    get.mockRejectedValueOnce(
      new ApiRequestError(404, { code: "not_found", message: "" })
    );
    expect(await saveDraft({}, "NF", ws)).toBe("new");
    storeProtocol("p1");
    get.mockRejectedValueOnce(
      new ApiRequestError(500, { code: "internal", message: "" })
    );
    await expect(saveDraft({}, "NF", ws)).rejects.toBeInstanceOf(
      ApiRequestError
    );
    expect(post).toHaveBeenCalledTimes(1);
  });
});
