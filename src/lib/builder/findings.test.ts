import { describe, expect, test } from "vitest";
import "@/components/protocol/kinds";
import type { ProtocolTree } from "@/lib/protocol/tree";
import { checkTree, locate } from "./findings";

function tree(...children: ProtocolTree["root"]["children"]): ProtocolTree {
  return {
    schema: 1,
    manifest: {
      content_warning: null,
      requires_consent: false,
      consent_text: null,
      min_quality: 0.6,
    },
    root: { type: "sequence", order: "fixed", children },
    soundtrack: [],
  };
}

function block(id: string, kind: string, config: Record<string, unknown>) {
  return { type: "block" as const, id, kind, label: id, config };
}

describe("checkTree", () => {
  test("a sound draft has no findings", () => {
    expect(
      checkTree(
        tree(
          block("a", "instructions", {
            lines: [{ text: "Breathe" }],
            advance: { mode: "timed", ms: 4000 },
          }),
          block("b", "rest", { mode: "timed", duration_s: 10 })
        )
      )
    ).toEqual([]);
  });

  test("names the field and the clip in the server's words and path grammar", () => {
    const findings = checkTree(
      tree(
        block("a", "instructions", {
          lines: [{ text: "x" }, { text: "" }],
          advance: { mode: "sometimes" },
        }),
        block("b", "instructions", { advance: { mode: "key" } }),
        block("c", "go-no-go", { variant: "classic" }),
        block("d", "nope", {})
      )
    );
    expect(findings).toEqual([
      {
        rule: "config",
        path: "root/0/config/lines/1/text",
        message: '"text" cannot be empty.',
      },
      {
        rule: "config",
        path: "root/0/config/advance/mode",
        message: '"mode" must be one of "timed", "key", "either".',
      },
      {
        rule: "config",
        path: "root/1/config/lines",
        message: '"lines" is required.',
      },
      {
        rule: "config",
        path: "root/2/config/variant",
        message: '"variant" must be one of "simple", "cued".',
      },
      {
        rule: "unknown_kind",
        path: "root/3",
        message: 'Unknown block kind "nope".',
      },
    ]);
  });

  test("walks a loop's template and leaves a column-filled config to the server", () => {
    const loop = {
      type: "loop" as const,
      id: "loop",
      template: {
        type: "sequence" as const,
        order: "fixed" as const,
        children: [
          block("filled", "rest", { mode: "timed", duration_s: { $var: "d" } }),
          block("broken", "rest", { mode: "timed" }),
        ],
      },
      conditions: { columns: ["d"], rows: [[10]] },
      order: "sequential" as const,
      repetitions: 1,
    };
    const findings = checkTree(
      tree(block("ok", "rest", { mode: "timed", duration_s: 5 }), loop)
    );
    expect(findings.map((f) => f.path)).toEqual([
      "root/1/t/1/config/duration_s",
    ]);
  });
});

describe("locate", () => {
  test("a clip, a setting, a row", () => {
    expect(locate("root/5/config/advance/ms")).toEqual({
      clip: 5,
      where: "Advance · Duration (ms)",
      rows: [],
    });
    expect(locate("root/6/config/lines/1/text")).toEqual({
      clip: 6,
      where: "Lines · Text",
      rows: [2],
    });
    expect(locate("root/2/t/0/config/duration_s")).toEqual({
      clip: 2,
      where: "Duration (s)",
      rows: [],
    });
  });

  test("the block itself, and the protocol as a whole", () => {
    expect(locate("root/3")).toEqual({ clip: 3, where: "", rows: [] });
    expect(locate("root")).toEqual({ clip: null, where: "", rows: [] });
    expect(locate("manifest/content_warning")).toEqual({
      clip: null,
      where: "Content warning",
      rows: [],
    });
  });
});
