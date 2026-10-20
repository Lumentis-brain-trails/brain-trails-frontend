/**
 * Live notes: what an operator writes while a session runs (backend V3-0007, S20).
 *
 * A note taken live is about the moment the operator *noticed* something, not the moment
 * they finished writing about it: it is stamped on the session clock when typing began
 * and saved as an `instant` annotation on the session's recording. The review page then
 * shows it as a pin at that second, next to the operator's commands.
 */

import { api } from "@/lib/api";

/** The longest note the backend stores (`MAX_ANNOTATION_BODY`). */
export const NOTE_MAX_CHARS = 4000;

export interface LiveNote {
  body: string;
  /** Seconds on the session clock when typing began. */
  tStartS: number;
}

/** The `POST /recordings/{id}/annotations` body for a live note; null when empty. */
export function liveNoteBody(note: LiveNote) {
  const body = note.body.trim().slice(0, NOTE_MAX_CHARS);
  if (!body) return null;
  return {
    kind: "instant" as const,
    body,
    // a note begun in the instant before the first sample is about the start
    t_start_s: Math.max(0, Math.round(note.tStartS * 1000) / 1000),
  };
}

/** Save a live note on the session's recording; resolves false when there was nothing to save. */
export async function saveLiveNote(
  recordingId: string,
  note: LiveNote
): Promise<boolean> {
  const body = liveNoteBody(note);
  if (!body) return false;
  await api.post(`recordings/${recordingId}/annotations`, body);
  return true;
}
