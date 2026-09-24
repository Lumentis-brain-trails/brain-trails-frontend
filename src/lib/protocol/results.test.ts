import { expect, test } from "vitest";
import { resultTitles } from "./results";
import type { ProtocolDefinition, TaskResult } from "./types";

const plan = (steps: { id: string; label: string }[]): ProtocolDefinition => ({
  id: "p",
  version: 1,
  title: "P",
  steps: steps.map((s) => ({ ...s, kind: "go-no-go", config: {} })),
});

const result = (stepId: string): TaskResult => ({
  stepId,
  taskKind: "go-no-go",
  summary: {},
});

test("results are named by the block's label, not its id", () => {
  // the second block on the timeline was dropped first, so it holds the plain id
  const titles = resultTitles(
    [result("go_no_go-2"), result("go_no_go")],
    plan([
      { id: "go_no_go-2", label: "Go-No Go" },
      { id: "go_no_go", label: "Go-No Go-2" },
    ])
  );
  expect(titles).toEqual({
    "go_no_go-2": "Go-No Go",
    go_no_go: "Go-No Go-2",
  });
});

test("results sharing a label are numbered in the order they ran", () => {
  const titles = resultTitles(
    [result("go_no_go-2"), result("go_no_go")],
    plan([
      { id: "go_no_go-2", label: "Signal Navigator" },
      { id: "go_no_go", label: "Signal Navigator" },
    ])
  );
  expect(titles).toEqual({
    "go_no_go-2": "Signal Navigator (1)",
    go_no_go: "Signal Navigator (2)",
  });
});

test("a step missing from the plan falls back to its id", () => {
  expect(resultTitles([result("challenge_a")], null)).toEqual({
    challenge_a: "challenge_a",
  });
});
