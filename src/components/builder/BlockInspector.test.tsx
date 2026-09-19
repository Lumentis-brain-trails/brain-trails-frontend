import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import messages from "../../../messages/en.json";
import blocks from "../../../schemas/blocks.schema.json";
import { BlockInspector } from "./BlockInspector";
import type { JsonSchema } from "@/lib/builder/fields";
import type { BlockNode } from "@/lib/protocol/tree";

const KIND_SCHEMAS = (blocks as { kinds: Record<string, JsonSchema> }).kinds;

const REST: BlockNode = {
  type: "block",
  id: "break_1",
  kind: "rest",
  label: "Break",
  config: { mode: "timed", duration_s: 30 },
};

function renderInspector(
  block: BlockNode = REST,
  handlers: Partial<{ onDelete: () => void; onDuplicate: () => void }> = {}
) {
  const seen = { block, changes: [] as BlockNode[] };
  function Harness() {
    const [current, setCurrent] = useState(block);
    return (
      <NextIntlClientProvider locale="en" messages={messages}>
        <BlockInspector
          block={current}
          kindSchemas={KIND_SCHEMAS}
          onChange={(next) => {
            seen.block = next;
            seen.changes.push(next);
            setCurrent(next);
          }}
          onDelete={handlers.onDelete ?? (() => {})}
          onDuplicate={handlers.onDuplicate ?? (() => {})}
        />
      </NextIntlClientProvider>
    );
  }
  render(<Harness />);
  return seen;
}

describe("BlockInspector", () => {
  afterEach(cleanup);

  test("shows the label, the read-only kind and the kind's own form", () => {
    renderInspector();
    expect(screen.getByLabelText("Name")).toHaveValue("Break");
    expect(screen.getByLabelText(/^Type/)).toHaveValue("rest");
    expect(screen.getByLabelText(/^Type/)).toHaveAttribute("readonly");
    // Straight from `schemas/blocks.schema.json`: the rest kind's own settings.
    expect(screen.getByLabelText("Mode")).toHaveValue("timed");
    expect(screen.getByLabelText("Duration (s)")).toHaveValue(30);
  });

  test("renaming the block hands back a new node", () => {
    const seen = renderInspector();
    const before = seen.block;
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Pause" },
    });
    expect(seen.block.label).toBe("Pause");
    expect(seen.block).not.toBe(before);
    expect(before.label).toBe("Break");
  });

  test("edits the common fields and drops the ones left empty", () => {
    const seen = renderInspector();
    fireEvent.change(screen.getByLabelText("Fixation before (s)"), {
      target: { value: "0.5" },
    });
    fireEvent.change(screen.getByLabelText("Jitter (s)"), {
      target: { value: "0.2" },
    });
    fireEvent.click(
      screen.getByLabelText("The participant may skip this block")
    );
    fireEvent.change(screen.getByLabelText(/^Condition/), {
      target: { value: "neutral" },
    });
    expect(seen.block).toMatchObject({
      pre_fixation_s: 0.5,
      jitter_s: 0.2,
      skippable: true,
      condition: "neutral",
    });

    fireEvent.change(screen.getByLabelText("Jitter (s)"), {
      target: { value: "" },
    });
    fireEvent.click(
      screen.getByLabelText("The participant may skip this block")
    );
    expect(seen.block).not.toHaveProperty("jitter_s");
    expect(seen.block).not.toHaveProperty("skippable");
  });

  test("editing the config replaces the config, not the block's own fields", () => {
    const seen = renderInspector();
    fireEvent.change(screen.getByLabelText("Duration (s)"), {
      target: { value: "45" },
    });
    expect(seen.block.config).toEqual({ mode: "timed", duration_s: 45 });
    expect(seen.block.id).toBe("break_1");
    expect(REST.config).toEqual({ mode: "timed", duration_s: 30 });
  });

  test("a value coming from a loop column is read-only", () => {
    renderInspector({
      ...REST,
      label: { $var: "clip_name" },
      condition: { $var: "arm" },
    });
    expect(screen.getByLabelText("Name")).toHaveValue(
      "From the column clip_name"
    );
    expect(screen.getByLabelText("Name")).toHaveAttribute("readonly");
    expect(screen.getByLabelText(/^Condition/)).toHaveValue(
      "From the column arm"
    );
  });

  test("an unknown kind keeps its config instead of losing it", () => {
    renderInspector({ ...REST, kind: "hologram", config: { spin: 3 } });
    expect(screen.getByText(/"spin": 3/)).toBeInTheDocument();
  });

  test("duplicate and delete call back", () => {
    const onDelete = vi.fn();
    const onDuplicate = vi.fn();
    renderInspector(REST, { onDelete, onDuplicate });
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
