import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, describe, expect, test } from "vitest";
import messages from "../../../messages/en.json";
import { GroupInspector, type GroupNode } from "./GroupInspector";
import type { LoopNode, SequenceNode } from "@/lib/protocol/tree";

const BLOCK = {
  type: "block" as const,
  id: "clip",
  kind: "video",
  label: { $var: "clip" },
  config: { media_id: { $var: "clip" } },
};

const LOOP: LoopNode = {
  type: "loop",
  id: "trials",
  template: { type: "sequence", order: "fixed", children: [BLOCK] },
  conditions: {
    columns: ["clip", "arm"],
    rows: [
      ["a", "calm"],
      ["b", "tense"],
    ],
  },
  order: "sequential",
  repetitions: 2,
};

const SEQUENCE: SequenceNode = {
  type: "sequence",
  id: "middle",
  order: "shuffle",
  children: [BLOCK],
};

function renderInspector(node: GroupNode) {
  const seen = { node, changes: [] as GroupNode[] };
  function Harness() {
    const [current, setCurrent] = useState(node);
    return (
      <NextIntlClientProvider locale="en" messages={messages}>
        <GroupInspector
          node={current}
          onChange={(next) => {
            seen.node = next;
            seen.changes.push(next);
            setCurrent(next);
          }}
        />
      </NextIntlClientProvider>
    );
  }
  render(<Harness />);
  return seen;
}

/** The table's invariant, which `parseTree` rejects a protocol for breaking. */
function isRectangular(loop: LoopNode): boolean {
  return loop.conditions.rows.every(
    (row) => row.length === loop.conditions.columns.length
  );
}

describe("GroupInspector", () => {
  afterEach(cleanup);

  test("a sequence has an order but no repetitions", () => {
    const seen = renderInspector(SEQUENCE);
    expect(screen.queryByLabelText(/^Repetitions/)).not.toBeInTheDocument();
    const order = screen.getByLabelText(/^Order/);
    expect(order).toHaveValue("shuffle");
    expect(
      [...(order as HTMLSelectElement).options].map((option) => option.value)
    ).toEqual(["fixed", "shuffle"]);

    fireEvent.change(order, { target: { value: "fixed" } });
    expect(seen.node).toMatchObject({ type: "sequence", order: "fixed" });
    expect(seen.node).not.toBe(SEQUENCE);
    expect(SEQUENCE.order).toBe("shuffle");
  });

  test("a loop sets repetitions, order and the longest run", () => {
    const seen = renderInspector(LOOP);
    expect(
      [...(screen.getByLabelText(/^Order/) as HTMLSelectElement).options].map(
        (option) => option.value
      )
    ).toEqual(["sequential", "random"]);

    fireEvent.change(screen.getByLabelText(/^Repetitions/), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText(/^Order/), {
      target: { value: "random" },
    });
    fireEvent.change(screen.getByLabelText(/^Longest run/), {
      target: { value: "2" },
    });
    expect(seen.node).toMatchObject({
      repetitions: 3,
      order: "random",
      max_run_same: 2,
    });

    fireEvent.change(screen.getByLabelText(/^Longest run/), {
      target: { value: "" },
    });
    expect(seen.node).not.toHaveProperty("max_run_same");
  });

  test("the condition table edits cells, columns and rows, staying rectangular", () => {
    const seen = renderInspector(LOOP);
    fireEvent.click(screen.getByText("Advanced"));

    fireEvent.change(screen.getByLabelText("clip, row 2"), {
      target: { value: "c" },
    });
    expect((seen.node as LoopNode).conditions.rows[1]).toEqual(["c", "tense"]);

    fireEvent.change(screen.getByLabelText("Name of column 2"), {
      target: { value: "mood" },
    });
    expect((seen.node as LoopNode).conditions.columns).toEqual([
      "clip",
      "mood",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Add column" }));
    expect((seen.node as LoopNode).conditions.columns).toHaveLength(3);
    expect(isRectangular(seen.node as LoopNode)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    expect((seen.node as LoopNode).conditions.rows).toHaveLength(3);
    expect(isRectangular(seen.node as LoopNode)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Remove row 3" }));
    expect((seen.node as LoopNode).conditions.rows).toHaveLength(2);

    fireEvent.click(
      screen.getByRole("button", { name: "Remove the column column_3" })
    );
    expect((seen.node as LoopNode).conditions.columns).toEqual([
      "clip",
      "mood",
    ]);
    expect(isRectangular(seen.node as LoopNode)).toBe(true);
    // The original node was never touched.
    expect(LOOP.conditions.columns).toEqual(["clip", "arm"]);
    expect(LOOP.conditions.rows[1]).toEqual(["b", "tense"]);
  });

  test("a sequence has no condition table", () => {
    renderInspector(SEQUENCE);
    expect(screen.queryByText("Advanced")).not.toBeInTheDocument();
  });
});
