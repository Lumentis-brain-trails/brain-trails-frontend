/**
 * The stimulus-session lifecycle: start, stream events, finish.
 *
 * A session ties three things together (backend V2 phase 2): a catalog item, a live EEG
 * recording, and one event timeline on the same clock. The backend owns two facts the
 * frontend must not invent - the `seed`, so a replay reproduces the run exactly, and the
 * `module`/`definition`, so what ran is what the catalog says ran.
 *
 * `task_label` is deliberately never sent. It is a closed CHECK constraint in SQL and has
 * no value for a go/no-go task; adding one needs a backend migration, and sending an
 * unlisted label would fail at the database rather than at the API.
 */

import { api } from "@/lib/api";
import { getProtocolModule } from "./definitions/signalNavigator";
import { safeParseProtocol } from "./schema";
import type { ProtocolDefinition } from "./types";

/** A session as the app sees it, mirroring the backend's `SessionOut`. */
export interface StimulusSession {
  id: string;
  status: "running" | "finished" | "aborted";
  media_id: string | null;
  media_title: string;
  recording_id: string;
  seed: number;
  params: Record<string, unknown>;
  summary: Record<string, unknown>;
  n_events: number;
  started_at: string;
  ended_at: string | null;
  events_url?: string | null;
}

/** What `POST /sessions` adds: where the EEG goes and what the stimulus needs to run. */
export interface StimulusSessionStart extends StimulusSession {
  analysis_id: string;
  ws_path: string;
  manifest: { content_warning?: string | null; expected_duration_s?: number };
  module: string | null;
  definition: Record<string, unknown>;
}

export interface StartSessionOptions {
  title?: string;
  device?: string;
  params?: Record<string, unknown>;
}

/** Open a session against a catalog item. The backend creates the live recording. */
export function startSession(
  mediaId: string,
  options: StartSessionOptions = {}
): Promise<StimulusSessionStart> {
  return api.post<StimulusSessionStart>("sessions", {
    media_id: mediaId,
    ...(options.title ? { title: options.title } : {}),
    device: options.device ?? "muse-2",
    params: options.params ?? {},
  });
}

/**
 * Close a session.
 *
 * Called on both a completed and an abandoned run: an unfinished session never merges its
 * event parts, so the timeline would stay unreadable.
 */
export function finishSession(
  sessionId: string,
  summary: Record<string, unknown>,
  aborted: boolean
): Promise<StimulusSession> {
  return api.post<StimulusSession>(`sessions/${sessionId}/finish`, {
    summary,
    aborted,
  });
}

export type ResolvedProtocol =
  { ok: true; protocol: ProtocolDefinition } | { ok: false; error: string };

/**
 * Turn what a session returned into a protocol this build can actually run.
 *
 * A `module` names code that ships with the frontend; a `definition` is JSON the catalog
 * carries. The module wins when both are present, because code is the more specific
 * statement of what the catalog item is. Either way the result is validated - a catalog
 * row is data from the server, and running an unvalidated definition would push a
 * malformed step into the renderer mid-session.
 */
export function resolveProtocol(
  module: string | null,
  definition: Record<string, unknown> | null | undefined
): ResolvedProtocol {
  if (module) {
    const known = getProtocolModule(module);
    if (known) return safeParseProtocol(known);
    return {
      ok: false,
      error: `This build has no protocol module named "${module}". It may need an update.`,
    };
  }
  if (definition && Object.keys(definition).length > 0)
    return safeParseProtocol(definition);
  return {
    ok: false,
    error: "This catalog item carries neither a module nor a definition.",
  };
}
