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
import { audioTaskKind } from "./AudioTask";
import { baselineTaskKind } from "./BaselineTask";
import { countdownTaskKind } from "./CountdownTask";
import { fixationTaskKind } from "./FixationTask";
import { questionnaireTaskKind } from "./QuestionnaireTask";
import { quizTaskKind } from "./QuizTask";
import { restTaskKind } from "./RestTask";
import { textTaskKind } from "./TextTask";
import type { TaskKind } from "@/lib/protocol/types";
import type { PromptConfig } from "./PromptTask";

/**
 * `instructions` is the protocol-tree name (backend V3-0004) for what the runtime has
 * always called `prompt`: the same renderer and schema under a second name, so trees read
 * in the builder's vocabulary while code-defined protocols keep `prompt`.
 */
export const instructionsTaskKind: TaskKind<PromptConfig> = {
  ...promptTaskKind,
  name: "instructions",
};

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
  if (!hasTaskKind(instructionsTaskKind.name))
    registerTaskKind(instructionsTaskKind);
  if (!hasTaskKind(fixationTaskKind.name)) registerTaskKind(fixationTaskKind);
  if (!hasTaskKind(baselineTaskKind.name)) registerTaskKind(baselineTaskKind);
  if (!hasTaskKind(restTaskKind.name)) registerTaskKind(restTaskKind);
  if (!hasTaskKind(countdownTaskKind.name)) registerTaskKind(countdownTaskKind);
  if (!hasTaskKind(audioTaskKind.name)) registerTaskKind(audioTaskKind);
  if (!hasTaskKind(textTaskKind.name)) registerTaskKind(textTaskKind);
  if (!hasTaskKind(questionnaireTaskKind.name))
    registerTaskKind(questionnaireTaskKind);
  if (!hasTaskKind(quizTaskKind.name)) registerTaskKind(quizTaskKind);
}

registerBuiltInKinds();
