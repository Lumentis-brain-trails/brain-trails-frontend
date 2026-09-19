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
import type { CaptureFiles } from "@/lib/muse/captureFiles";
import { uploadToStorage } from "@/lib/upload";
import type { WireEvent } from "./marker";
import { getProtocolModule } from "./definitions/signalNavigator";
import { safeParseProtocol } from "./schema";
import type { components } from "@/lib/api-types";
import type { MediaManifest } from "@/lib/types";
import type { ProtocolDefinition } from "./types";

/** A session as the app sees it (the backend's `SessionOut`, generated). */
export type StimulusSession = components["schemas"]["SessionOut"];

/** What `POST /sessions` adds: where the EEG goes and what the stimulus needs to run. */
export type StimulusSessionStart = Omit<
  components["schemas"]["SessionStartOut"],
  "manifest"
> & { manifest: MediaManifest };

export interface StartSessionOptions {
  title?: string;
  device?: string;
  params?: Record<string, unknown>;
}

/**
 * Open a session against a catalog item (backend V3-0005).
 *
 * The EEG is captured in the browser and uploaded at finish: the response carries the
 * presigned forms for the session CSV, the extras sidecar and the raw capture.
 */
export function startSession(
  mediaId: string,
  options: StartSessionOptions = {}
): Promise<StimulusSessionStart> {
  return api.post<StimulusSessionStart>("sessions", {
    media_id: mediaId,
    capture: "upload",
    ...(options.title ? { title: options.title } : {}),
    device: options.device ?? "muse-2",
    params: options.params ?? {},
  });
}

export type CaptureForms = components["schemas"]["CaptureForms"];
export type CaptureKeys = components["schemas"]["CaptureKeys"];

/**
 * Upload a run's capture files through the session's forms; returns the keys `finish`
 * expects. The raw capture is left out when it exceeds its cap - the EEG still goes up.
 */
export async function uploadCapture(
  forms: CaptureForms,
  files: CaptureFiles,
  onProgress: (pct: number) => void
): Promise<CaptureKeys> {
  const plan: [CaptureForms["original"], Blob][] = [
    [forms.original, files.csv],
  ];
  if (files.extras) plan.push([forms.extras, files.extras]);
  if (files.ble && files.ble.size <= forms.max_ble_mb * 1024 * 1024)
    plan.push([forms.ble, files.ble]);
  const total = plan.reduce((n, [, blob]) => n + blob.size, 0);
  let done = 0;
  for (const [form, blob] of plan) {
    await uploadToStorage({ ...form, max_mb: forms.max_mb }, blob, (pct) =>
      onProgress(((done + (blob.size * pct) / 100) / total) * 100)
    );
    done += blob.size;
  }
  const sent = (form: CaptureForms["original"]) =>
    plan.some(([f]) => f === form) ? form.key : null;
  return {
    original: forms.original.key,
    extras: sent(forms.extras),
    ble: sent(forms.ble),
  };
}

export interface FinishOptions {
  summary: Record<string, unknown>;
  aborted: boolean;
  /** The uploaded capture; omitted only for an aborted run that captured nothing. */
  capture?: CaptureKeys;
  /** The whole timeline, re-sent; the backend drops what it already has. */
  events?: WireEvent[];
}

/**
 * Close a session: store its capture, merge its timeline, start the analysis.
 *
 * Idempotent on the backend, so a failed call can simply be retried.
 */
export function finishSession(
  sessionId: string,
  options: FinishOptions
): Promise<StimulusSession> {
  return api.post<StimulusSession>(`sessions/${sessionId}/finish`, {
    summary: options.summary,
    aborted: options.aborted,
    ...(options.capture ? { capture: options.capture } : {}),
    ...(options.events ? { events: options.events } : {}),
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
