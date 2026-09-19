"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import {
  buildCaptureFiles,
  type StoppedCapture,
} from "@/lib/muse/captureFiles";
import { MODEL_PROFILES } from "@/lib/muse/models";
import {
  uploadToStorage,
  type Presign,
  type SessionPresign,
} from "@/lib/upload";
import { Button, ErrorBanner, KeyValue } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";

/** A stopped capture waiting for the user's decision. */
export interface StoppedSession extends StoppedCapture {
  title: string;
  taskLabel: string;
}

const fmtMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const fmtSeconds = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}:${String(r).padStart(2, "0")}`;
};

/**
 * Shown after Stop: what was captured (duration, lost samples, jitter, drift)
 * and two ways out, upload or discard. The upload builds the canonical CSV in
 * memory, sends it straight to storage through the presigned form and then
 * registers the recording exactly like a file upload would. Two sidecars go
 * with it when there is something in them: the decoded extras and the raw
 * Bluetooth capture (backend decision V2-0006).
 */
export function SessionSheet({
  session,
  onClose,
}: {
  session: StoppedSession;
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { capture, timeline } = session;
  const lost = capture.missingSamples;

  const upload = useMutation({
    mutationFn: async (): Promise<{
      recording_id: string;
      captureSkipped: boolean;
    }> => {
      const built = await buildCaptureFiles(session);
      const blob = built.csv;
      const slug =
        session.title
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "session";
      const extrasBlob = built.extras;
      const captureBlob = built.ble;
      const presign = await api.post<SessionPresign>("recordings/uploads", {
        filename: `${slug}.csv`,
        with_extras: extrasBlob !== null,
        with_ble: captureBlob !== null,
      });
      if (blob.size > presign.max_mb * 1024 * 1024)
        throw new Error(`Session exceeds ${presign.max_mb} MB.`);
      // An oversized capture must not cost the session: the EEG still goes up,
      // and the user is told what was left behind.
      const captureFits =
        captureBlob !== null &&
        captureBlob.size <= presign.max_ble_mb * 1024 * 1024;
      const files: [Presign, Blob][] = [[presign, blob]];
      if (extrasBlob && presign.extras)
        files.push([presign.extras, extrasBlob]);
      if (captureBlob && captureFits && presign.ble)
        files.push([presign.ble, captureBlob]);
      const total = files.reduce((n, [, b]) => n + b.size, 0);
      let done = 0;
      setProgress(0);
      for (const [form, file] of files) {
        await uploadToStorage(form, file, (pct) =>
          setProgress(((done + (file.size * pct) / 100) / total) * 100)
        );
        done += file.size;
      }
      const sent = (form: Presign | null) =>
        form && files.some(([f]) => f === form) ? form.key : null;
      const completed = await api.post<{ recording_id: string }>(
        "recordings/complete",
        {
          key: presign.key,
          title: session.title.trim(),
          task_label: session.taskLabel || null,
          device: MODEL_PROFILES[session.model].apiDevice,
          cleaner: "classic",
          extras_key: sent(presign.extras),
          ble_key: sent(presign.ble),
        }
      );
      return {
        ...completed,
        captureSkipped: captureBlob !== null && !captureFits,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
      toast("success", "Session uploaded. Processing started.");
      if (data.captureSkipped)
        toast(
          "error",
          "The raw Bluetooth capture was too large to upload and was not kept."
        );
      router.push(`/recordings/${data.recording_id}`);
    },
    onError: (e: Error) => {
      setProgress(null);
      setError(e.message);
    },
  });

  return (
    <Sheet
      title="Session recorded"
      onClose={onClose}
      dismissible={!upload.isPending}
    >
      <div className="space-y-5">
        {error && <ErrorBanner message={error} />}
        <div className="rounded-[var(--radius-card)] border border-hairline">
          <KeyValue
            label="Duration"
            value={fmtSeconds(capture.durationS)}
            mono
          />
          <KeyValue
            label="Samples"
            value={`${capture.sampleCount} · ${lost} missing`}
            mono
          />
          <KeyValue
            label="Packets lost"
            value={String(timeline.lostPackets)}
            mono
          />
          <KeyValue
            label="Clock"
            value={
              timeline.effectiveRateHz
                ? `${timeline.effectiveRateHz.toFixed(2)} Hz · drift ${timeline.driftPpm?.toFixed(0)} ppm`
                : "—"
            }
            mono
          />
          <KeyValue
            label="Headband"
            value={MODEL_PROFILES[session.model].label}
          />
          <KeyValue
            label="Other sensors"
            value={(() => {
              const c = session.extras.counts();
              const motion = (c.acc ?? 0) * 3;
              const ppg = (c.ppg_infrared ?? 0) * 6;
              if (motion + ppg === 0) return "none";
              const parts = [`${motion} motion`];
              // The Athena's PPG is not decoded yet; it is in the raw capture.
              if (MODEL_PROFILES[session.model].hasPpg)
                parts.push(`${ppg} PPG samples`);
              return parts.join(" · ");
            })()}
            mono
          />
          <KeyValue
            label="Raw capture"
            value={
              session.raw.count > 0
                ? `${session.raw.count} packets · ${fmtMb(session.raw.payloadBytes)}`
                : "none (simulated)"
            }
            mono
          />
          <KeyValue
            label="Arrival jitter"
            value={
              timeline.jitterRmsMs !== null
                ? `${timeline.jitterRmsMs.toFixed(1)} ms RMS`
                : "—"
            }
            mono
          />
        </div>
        {lost > 0 && (
          <p className="type-caption text-ink-3">
            Missing samples are interpolated by the pipeline and listed as gaps
            on the recording.
          </p>
        )}
        {progress !== null && (
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            disabled={upload.isPending}
            onClick={onClose}
          >
            Discard
          </Button>
          <Button
            disabled={upload.isPending || capture.blocks.length === 0}
            onClick={() => upload.mutate()}
          >
            {upload.isPending ? "Uploading…" : "Upload and analyze"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
