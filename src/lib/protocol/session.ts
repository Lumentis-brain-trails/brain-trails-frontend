/**
 * The session lifecycle: start a protocol, post its plan, finish with the capture.
 *
 * A session ties together (backend V3-0004, V3-0005) a protocol version, an EEG
 * recording captured in the browser, the plan resolved from the version's tree, and one
 * event timeline on the EEG clock. The backend owns the facts the frontend must not
 * invent: the `seed`, so a replay reproduces the run exactly, and the version's tree, so
 * what ran is what was published.
 *
 * `task_label` is deliberately never sent. It is a closed CHECK constraint in SQL;
 * sending an unlisted label would fail at the database rather than at the API.
 */

import { api } from "@/lib/api";
import type { CaptureFiles } from "@/lib/muse/captureFiles";
import { uploadToStorage } from "@/lib/upload";
import type { WireEvent } from "./marker";
import type { components } from "@/lib/api-types";
import type { ProtocolDefinition } from "./types";

/** A session as the app sees it (the backend's `SessionOut`, generated). */
export type StimulusSession = components["schemas"]["SessionOut"];

/** What `POST /sessions` adds: where the EEG goes, the tree, the seed, the media. */
export type StimulusSessionStart = components["schemas"]["SessionStartOut"];

export interface StartSessionOptions {
  /** An earlier published version; the current one by default. */
  version?: number;
  title?: string;
  device?: string;
  params?: Record<string, unknown>;
}

/**
 * Open a session running a protocol (backend V3-0004, V3-0005).
 *
 * The EEG is captured in the browser and uploaded at finish: the response carries the
 * presigned forms for the session CSV, the extras sidecar and the raw capture.
 */
export function startSession(
  protocolId: string,
  options: StartSessionOptions = {}
): Promise<StimulusSessionStart> {
  return api.post<StimulusSessionStart>("sessions", {
    protocol_id: protocolId,
    capture: "upload",
    ...(options.version ? { version: options.version } : {}),
    ...(options.title ? { title: options.title } : {}),
    device: options.device ?? "muse-2",
    params: options.params ?? {},
  });
}

/**
 * Store the plan this run resolved, before its first block: review and analysis read
 * what was shown, not what could have been. Safe to retry with the same plan.
 */
export async function postPlan(
  sessionId: string,
  plan: ProtocolDefinition
): Promise<void> {
  await api.post(`sessions/${sessionId}/plan`, { plan });
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
