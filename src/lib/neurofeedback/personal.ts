/**
 * The personal neurofeedback protocol the Neurofeedback page writes and runs (V4-0010).
 *
 * The page is a shortcut, not a second runner: what the person chooses - where on their
 * map, what to watch, how long - becomes an ordinary protocol of theirs (a short
 * instruction, then one `neurofeedback` block on `landscape_region`), published and run
 * like any other, so the session, its timeline and its analysis are the usual ones. The
 * same protocol is updated each time, so the person's list does not fill up with copies.
 *
 * The words of the instruction are written in the person's language when the protocol
 * is made: a protocol's texts are its author's, and here the author is the person.
 */

import { ApiRequestError, api } from "@/lib/api";
import type { NeurofeedbackConfig } from "@/lib/protocol/blocks";
import type { ProtocolDetail } from "@/lib/protocol/catalog";
import type { ProtocolTree } from "@/lib/protocol/tree";
import { inWorkspace } from "@/lib/workspace";

export type Feedback = Exclude<NeurofeedbackConfig["feedback"], "video">;

export const FEEDBACKS: readonly Feedback[] = ["plane", "tuning", "ribbons"];

/** Training lengths offered, in minutes (Myndlift's sessions run 15-30 minutes). */
export const MINUTES = [5, 10, 15, 20] as const;

/** The baseline that sets the threshold: a minute of where the person is today. */
export const BASELINE_S = 60;

/**
 * The share of the baseline that would have been rewarded: higher than the band
 * block's 0.4, because reward rate keeps a person training (commercial systems aim at
 * 60-80%), and the baseline is the person's own scale today.
 */
export const TARGET_FRACTION = 0.6;

export interface PersonalChoice {
  targets: NonNullable<NeurofeedbackConfig["targets"]>;
  feedback: Feedback;
  minutes: number;
}

export interface PersonalTexts {
  ready: string;
  how: string;
  start: string;
  label: string;
  warning: string;
}

/** The protocol tree for a choice. */
export function personalProtocol(
  choice: PersonalChoice,
  texts: PersonalTexts
): ProtocolTree {
  return {
    schema: 1,
    manifest: {
      content_warning: texts.warning,
      requires_consent: false,
      consent_text: null,
      min_quality: 0.6,
    },
    root: {
      type: "sequence",
      id: "root",
      order: "fixed",
      children: [
        {
          type: "block",
          id: "get_ready",
          kind: "instructions",
          label: texts.label,
          condition: "arrival",
          config: {
            lines: [
              { text: texts.ready, holdMs: 4000 },
              { text: texts.how, holdMs: 5000 },
            ],
            advance: { mode: "key", label: texts.start },
          },
        },
        {
          type: "block",
          id: "landscape_feedback",
          kind: "neurofeedback",
          label: "Neurofeedback",
          config: {
            signal: "landscape_region",
            feedback: choice.feedback,
            targets: {
              ...choice.targets,
              points: choice.targets.points.map(([x, y]) => [x, y]),
            },
            baseline_s: BASELINE_S,
            duration_s: Math.round(choice.minutes * 60),
            threshold: { mode: "baseline", target_fraction: TARGET_FRACTION },
          },
        },
      ],
    },
  } as unknown as ProtocolTree;
}

/** Where the page remembers the person's protocol, to update it rather than copy it. */
export const STORED_KEY = "bt.neurofeedback.protocol";

export function storedProtocol(): string | null {
  try {
    return window.localStorage.getItem(STORED_KEY);
  } catch {
    return null;
  }
}

export function storeProtocol(id: string): void {
  try {
    window.localStorage.setItem(STORED_KEY, id);
  } catch {
    // private mode: a new protocol next time, nothing worse
  }
}

/**
 * Update the person's neurofeedback protocol, or make it the first time.
 *
 * The remembered protocol is reused unless it is gone or no longer theirs (404/403) or
 * archived (an archived protocol publishes but never starts a session); any other
 * failure is raised, so a network error never leaves a stray copy behind. Returns the
 * protocol's id, its draft written.
 */
export async function saveDraft(
  draft: unknown,
  title: string,
  workspace: { id: string } | undefined
): Promise<string> {
  const known = storedProtocol();
  if (known) {
    let detail: ProtocolDetail | null = null;
    try {
      detail = await api.get<ProtocolDetail>(`protocols/${known}`);
    } catch (error) {
      // gone, or not ours any more: a new one below; anything else is a real failure
      if (
        !(error instanceof ApiRequestError) ||
        (error.status !== 404 && error.status !== 403)
      )
        throw error;
    }
    // an archived protocol publishes but never starts a session: make a new one
    if (detail && !detail.archived) {
      await api.put(
        `protocols/${known}/draft`,
        { draft },
        { ifMatch: detail.draft_rev ?? 1 }
      );
      return known;
    }
  }
  const made = await api.post<ProtocolDetail>(
    inWorkspace("protocols", workspace),
    { title, draft }
  );
  storeProtocol(made.id);
  return made.id;
}
