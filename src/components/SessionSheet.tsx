"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
  useUploadErrorMessage,
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
  const t = useTranslations("recordings.session");
  const tModel = useTranslations("device.models");
  const describe = useUploadErrorMessage();
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
        throw new Error(t("tooLarge", { max: presign.max_mb }));
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
      toast("success", t("done"));
      if (data.captureSkipped) toast("error", t("captureSkipped"));
      router.push(`/recordings/${data.recording_id}`);
    },
    onError: (e: Error) => {
      setProgress(null);
      setError(describe(e));
    },
  });

  return (
    <Sheet title={t("title")} onClose={onClose} dismissible={!upload.isPending}>
      <div className="space-y-5">
        {error && <ErrorBanner message={error} />}
        <div className="rounded-[var(--radius-card)] border border-hairline">
          <KeyValue
            label={t("duration")}
            value={fmtSeconds(capture.durationS)}
            mono
          />
          <KeyValue
            label={t("samples")}
            value={t("samplesValue", {
              count: String(capture.sampleCount),
              missing: String(lost),
            })}
            mono
          />
          <KeyValue
            label={t("packetsLost")}
            value={String(timeline.lostPackets)}
            mono
          />
          <KeyValue
            label={t("clock")}
            value={
              timeline.effectiveRateHz
                ? t("clockValue", {
                    rate: timeline.effectiveRateHz.toFixed(2),
                    drift: String(timeline.driftPpm?.toFixed(0)),
                  })
                : "—"
            }
            mono
          />
          <KeyValue label={t("headband")} value={tModel(session.model)} />
          <KeyValue
            label={t("otherSensors")}
            value={(() => {
              const c = session.extras.counts();
              const motion = (c.acc ?? 0) * 3;
              const ppg = (c.ppg_infrared ?? 0) * 6;
              if (motion + ppg === 0) return t("sensorsNone");
              // The Athena's PPG is not decoded yet; it is in the raw capture.
              return MODEL_PROFILES[session.model].hasPpg
                ? t("sensorsMotionPpg", {
                    motion: String(motion),
                    ppg: String(ppg),
                  })
                : t("sensorsMotion", { motion: String(motion) });
            })()}
            mono
          />
          <KeyValue
            label={t("rawCapture")}
            value={
              session.raw.count > 0
                ? t("rawValue", {
                    count: String(session.raw.count),
                    size: fmtMb(session.raw.payloadBytes),
                  })
                : t("rawNone")
            }
            mono
          />
          <KeyValue
            label={t("jitter")}
            value={
              timeline.jitterRmsMs !== null
                ? t("jitterValue", { ms: timeline.jitterRmsMs.toFixed(1) })
                : "—"
            }
            mono
          />
        </div>
        {lost > 0 && <p className="type-caption text-ink-3">{t("gaps")}</p>}
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
            {t("discard")}
          </Button>
          <Button
            disabled={upload.isPending || capture.blocks.length === 0}
            onClick={() => upload.mutate()}
          >
            {upload.isPending ? t("uploading") : t("upload")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
