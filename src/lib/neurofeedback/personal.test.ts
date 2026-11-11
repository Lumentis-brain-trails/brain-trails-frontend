import { expect, test } from "vitest";
import { neurofeedbackConfigSchema } from "@/lib/protocol/blocks";
import { protocolTreeSchema } from "@/lib/protocol/tree";
import { hasLandscapeBlock } from "./landscape";
import { personalProtocol } from "./personal";

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
