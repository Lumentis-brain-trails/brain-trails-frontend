/**
 * Registers every built-in task kind.
 *
 * Imported for its side effect by anything that parses or runs a protocol. Kinds are only
 * referenced from protocol *data*, so without an explicit import here a bundler would be
 * free to drop them.
 */

import { hasTaskKind, registerTaskKind } from "@/lib/protocol/registry";
import { breathingTaskKind } from "./BreathingTask";
import { goNoGoTaskKind } from "./GoNoGoTask";
import { imageSequenceTaskKind } from "./ImageSequenceTask";
import { promptTaskKind } from "./PromptTask";
import { videoTaskKind } from "./VideoTask";

/**
 * Idempotent: React Fast Refresh and test re-imports must not double-register.
 *
 * Registered one by one rather than over an array: each kind has its own config type, and
 * a heterogeneous array collapses them into a union that no longer matches `TaskKind<C>`.
 */
export function registerBuiltInKinds(): void {
  if (!hasTaskKind(promptTaskKind.name)) registerTaskKind(promptTaskKind);
  if (!hasTaskKind(breathingTaskKind.name)) registerTaskKind(breathingTaskKind);
  if (!hasTaskKind(goNoGoTaskKind.name)) registerTaskKind(goNoGoTaskKind);
  if (!hasTaskKind(imageSequenceTaskKind.name))
    registerTaskKind(imageSequenceTaskKind);
  if (!hasTaskKind(videoTaskKind.name)) registerTaskKind(videoTaskKind);
}

registerBuiltInKinds();
