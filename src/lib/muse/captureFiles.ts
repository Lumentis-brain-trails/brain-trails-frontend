/**
 * The files one headband capture becomes: the canonical session CSV, the extras sidecar
 * (motion, PPG) and the raw Bluetooth capture (backend V2-0006).
 *
 * Shared by the free recording (/record) and a protocol run, which upload the same three
 * files - through `POST /recordings/uploads` and through the session's own forms
 * (backend V3-0005) respectively.
 */
import { buildCaptureBlob, type RawCapture } from "./capture";
import type { MuseModel } from "./models";
import {
  buildExtrasCsv,
  buildSessionCsv,
  type ExtrasRecorder,
  type SessionCapture,
} from "./session";
import type { TimelineStats } from "./timeline";

/** A stopped capture and the device facts its file headers need. */
export interface StoppedCapture {
  capture: SessionCapture;
  timeline: TimelineStats;
  extras: ExtrasRecorder;
  raw: RawCapture;
  deviceName: string;
  model: MuseModel;
}

export interface CaptureFiles {
  csv: Blob;
  /** Null when the band sent no motion or PPG packet. */
  extras: Blob | null;
  /** Null when there is no raw traffic to keep (the simulator sends none). */
  ble: Blob | null;
}

/** Build the three files; the extras and raw recorders are stopped by this call. */
export async function buildCaptureFiles(
  stopped: StoppedCapture
): Promise<CaptureFiles> {
  const { capture, timeline } = stopped;
  const csv = new Blob(
    [
      buildSessionCsv(capture, {
        deviceName: stopped.deviceName,
        model: stopped.model,
        timeline,
      }),
    ],
    { type: "text/csv" }
  );
  const extrasPackets = stopped.extras.stop();
  const extras =
    extrasPackets.length > 0
      ? new Blob([buildExtrasCsv(extrasPackets, capture, timeline)], {
          type: "text/csv",
        })
      : null;
  const ble = await buildCaptureBlob(stopped.raw.stop(), {
    model: stopped.model,
    deviceName: stopped.deviceName,
    startedAt: capture.startedAt.toISOString(),
    timeline: {
      hostMsAtIndex0: timeline.hostMsAtIndex0,
      msPerSample: timeline.msPerSample,
      firstSampleIndex: capture.firstSampleIndex,
    },
    userAgent: navigator.userAgent,
  });
  return { csv, extras, ble };
}
