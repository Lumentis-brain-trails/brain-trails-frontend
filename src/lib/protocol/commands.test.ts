import { describe, expect, test, vi } from "vitest";
import {
  COMMAND_TYPES,
  MESSAGE_MAX_CHARS,
  SAFE_POINTS,
  createLocalCommandPort,
  makeCommand,
  operatorCommandSchema,
} from "./commands";

describe("operator commands", () => {
  test("every command has a safe point, and only a pause waits for the block", () => {
    expect(Object.keys(SAFE_POINTS).sort()).toEqual([...COMMAND_TYPES].sort());
    expect(
      COMMAND_TYPES.filter((type) => SAFE_POINTS[type] === "block_end")
    ).toEqual(["pause"]);
  });

  test("makeCommand gives each command its own id, and trims and caps the text", () => {
    const a = makeCommand("message", `  ${"x".repeat(MESSAGE_MAX_CHARS + 5)} `);
    const b = makeCommand("flag");
    expect(a.id).not.toBe(b.id);
    expect(a.text).toHaveLength(MESSAGE_MAX_CHARS);
    expect(b).not.toHaveProperty("text");
    expect(operatorCommandSchema.parse(a)).toEqual(a);
    expect(makeCommand("message", "   ")).not.toHaveProperty("text");
  });

  test("a threshold nudge carries its steps, five at most either way", () => {
    const nudge = makeCommand("nudge_threshold", undefined, -2);
    expect(nudge).toMatchObject({ type: "nudge_threshold", steps: -2 });
    expect(operatorCommandSchema.parse(nudge)).toEqual(nudge);
    expect(SAFE_POINTS.nudge_threshold).toBe("now");
    expect(
      operatorCommandSchema.safeParse({ ...nudge, steps: 6 }).success
    ).toBe(false);
    expect(makeCommand("flag")).not.toHaveProperty("steps");
  });

  test("the schema fills the source and refuses unknown commands", () => {
    expect(operatorCommandSchema.parse({ id: "1", type: "pause" }).source).toBe(
      "console"
    );
    expect(
      operatorCommandSchema.safeParse({ id: "1", type: "jump" }).success
    ).toBe(false);
  });

  test("a local port delivers to every listener until it unsubscribes", () => {
    const port = createLocalCommandPort();
    const first = vi.fn();
    const second = vi.fn();
    const stop = port.subscribe(first);
    port.subscribe(second);
    const command = makeCommand("pause");
    port.send(command);
    stop();
    port.send(makeCommand("resume"));
    expect(first).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith(command);
    expect(second).toHaveBeenCalledTimes(2);
  });
});
