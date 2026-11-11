import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiRequestError, api } from "@/lib/api";
import { neurofeedbackConfigSchema } from "@/lib/protocol/blocks";
import { protocolTreeSchema } from "@/lib/protocol/tree";
import { hasLandscapeBlock } from "./landscape";
import {
  personalProtocol,
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
