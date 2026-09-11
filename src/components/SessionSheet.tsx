"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { buildSessionCsv, type SessionCapture } from "@/lib/muse/session";
import type { TimelineStats } from "@/lib/muse/timeline";
import { uploadToStorage, type Presign } from "@/lib/upload";
import { Button, ErrorBanner, KeyValue } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";

/** A stopped capture waiting for the user's decision. */
export interface StoppedSession {
  capture: SessionCapture;
  timeline: TimelineStats;
  deviceName: string;
  title: string;
  taskLabel: string;
}

const fmtSeconds = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}:${String(r).padStart(2, "0")}`;
};

/**
 * Shown after Stop: what was captured (duration, lost samples, jitter, drift)
 * and two ways out, upload or discard. The upload builds the canonical CSV in
 * memory, sends it straight to storage through the presigned form and then
 * registers the recording exactly like a file upload would.
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
    mutationFn: async () => {
      const csv = buildSessionCsv(capture, {
        deviceName: session.deviceName,
        timeline,
      });
      const blob = new Blob([csv], { type: "text/csv" });
      const slug =
        session.title
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "session";
      const presign = await api.post<Presign>("recordings/uploads", {
        filename: `${slug}.csv`,
      });
      if (blob.size > presign.max_mb * 1024 * 1024)
        throw new Error(`Session exceeds ${presign.max_mb} MB.`);
      setProgress(0);
      await uploadToStorage(presign, blob, setProgress);
      return api.post<{ recording_id: string }>("recordings/complete", {
        key: presign.key,
        title: session.title.trim(),
        task_label: session.taskLabel || null,
        cleaner: "classic",
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
      toast("success", "Session uploaded. Processing started.");
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
            value={`${capture.blocks.length * 12} · ${lost} missing`}
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
