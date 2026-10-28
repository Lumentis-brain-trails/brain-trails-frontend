/**
 * The runner's command port (backend V3-0007, sprint 21 / T1).
 *
 * An operator never changes a run by themselves: they *ask* the runner, which is the
 * only state machine and the only clock. The runner applies each command at the next
 * safe point for the block on screen and logs it as an `operator_command` event, so an
 * overridden run is still a fully described run - an export shows that a clip was cut at
 * 41 s by the operator rather than looking like a 41 s clip.
 *
 * This module is the vocabulary: the commands, where each one takes effect, the state
 * the runner reports back, and an in-memory port. The transport between two windows is
 * `lib/console/channel.ts`; the runner itself only sees a `CommandPort`.
 */

import { z } from "zod";

/** Every command the runner honours today. */
export const COMMAND_TYPES = [
  "pause",
  "resume",
  "end_block",
  "skip_block",
  "repeat_block",
  "extend_rest",
  "message",
  "flag",
  "abort",
] as const;

export type CommandType = (typeof COMMAND_TYPES)[number];

/** The longest message an operator may put on the participant's screen. */
export const MESSAGE_MAX_CHARS = 280;

/** How long a message stays on the participant's screen. */
export const MESSAGE_SHOWN_MS = 10_000;

/** How much one `extend_rest` adds to a timed rest. */
export const EXTEND_REST_S = 30;

/** The event type every command is logged under, whatever it did. */
export const OPERATOR_COMMAND_EVENT = "operator_command";

export const operatorCommandSchema = z.object({
  /** Unique per command: a message delivered twice is applied once. */
  id: z.string().min(1).max(64),
  type: z.enum(COMMAND_TYPES),
  /** The words of a `message`, or an optional note on a `flag`. */
  text: z.string().max(MESSAGE_MAX_CHARS).optional(),
  /** Who asked: the console on this machine for now; a remote console from T5. */
  source: z.enum(["console"]).default("console"),
});

export type OperatorCommand = z.infer<typeof operatorCommandSchema>;

/**
 * Where a command takes effect.
 *
 * - `now`: as soon as it arrives (a message, a flag, abort, ending, skipping or repeating
 *   the block, adding time to a rest).
 * - `block_end`: when the block on screen ends by itself. A pause holds the run
 *   *between* blocks: no kind is cut in the middle of a stimulus, and no kind has to
 *   know how to freeze its own timers. Pausing inside a block is a later step: it needs
 *   each kind to declare how it stops (a video can, a trial schedule cannot).
 */
export type SafePoint = "now" | "block_end";

/** Where each command lands, whatever the block. */
export const SAFE_POINTS: Record<CommandType, SafePoint> = {
  pause: "block_end",
  resume: "now",
  end_block: "now",
  skip_block: "now",
  repeat_block: "now",
  extend_rest: "now",
  message: "now",
  flag: "now",
  abort: "now",
};

/** What the runner did with a command, as the log records it. */
export type CommandOutcome = "applied" | "deferred" | "ignored";

/** What the runner tells a console about itself, after every change. */
export interface RunnerState {
  /** `warning` until the participant begins; `paused` while held between blocks. */
  status: "warning" | "running" | "paused";
  stepIndex: number;
  stepId: string | null;
  /** A pause was asked for and waits for the block to end. */
  pausePending: boolean;
  /** The step on screen is a timed rest, which `extend_rest` can lengthen. */
  extendable: boolean;
  /** How many times the operator repeated the step on screen (0 the first time). */
  attempt: number;
  /** The operator's message on the participant's screen, if any. */
  message: string | null;
}

/** Where a reloaded participant window picks a console run up (`ProtocolRunner`). */
export interface RunResume {
  stepIndex: number;
  /** The first marker `seq` the new window may use. */
  seqFrom: number;
  /** The block on screen started and never ended: close it before running it again. */
  interrupted: boolean;
}

/** Where a runner receives commands from. */
export interface CommandPort {
  /** Call `listener` with every command from now on; returns the unsubscribe. */
  subscribe(listener: (command: OperatorCommand) => void): () => void;
}

/** A port fed by hand: what the tests use, and a console in the runner's own window. */
export interface LocalCommandPort extends CommandPort {
  send(command: OperatorCommand): void;
}

export function createLocalCommandPort(): LocalCommandPort {
  const listeners = new Set<(command: OperatorCommand) => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    send(command) {
      for (const listener of [...listeners]) listener(command);
    },
  };
}

let counter = 0;

/** A command with a fresh id; `text` is trimmed and capped. */
export function makeCommand(type: CommandType, text?: string): OperatorCommand {
  counter += 1;
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${counter}`;
  const trimmed = text?.trim().slice(0, MESSAGE_MAX_CHARS);
  return {
    id: random,
    type,
    source: "console",
    ...(trimmed ? { text: trimmed } : {}),
  };
}
