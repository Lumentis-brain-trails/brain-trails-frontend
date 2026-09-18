"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { ApiRequestError, api } from "@/lib/api";
import type { Analysis, Recording } from "@/lib/types";
import { Sheet } from "@/components/Sheet";
import { SignalPreview } from "@/components/SignalPreview";
import { StatusBadge } from "@/components/StatusBadge";
import { TrailPlot } from "@/components/TrailPlot";
import {
  Button,
  Card,
  ErrorBanner,
  Icon,
  KeyValue,
  SectionTitle,
  Skeleton,
  Spinner,
} from "@/components/ui";
import { useToast } from "@/components/Toast";

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "–";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? `${m} min ${s} s` : `${s} s`;
}

export default function RecordingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const recording = useQuery({
    queryKey: ["recording", id],
    queryFn: () => api.get<Recording>(`recordings/${id}`),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "uploaded" || s === "processing" ? 2000 : false;
    },
  });

  const isLive =
    recording.data?.source === "stream" &&
    recording.data?.status === "processing";
  const analysis = useQuery({
    queryKey: ["analysis", id, recording.data?.status],
    queryFn: () => api.get<Analysis>(`recordings/${id}/analysis`),
    enabled: recording.data?.status === "done" || isLive,
    refetchInterval: isLive ? 1500 : false,
    retry: isLive,
  });

  const reprocess = useMutation({
    mutationFn: (cleaner: string) =>
      api.post(`recordings/${id}/reprocess`, { cleaner }),
    onSuccess: () => {
      toast("success", "Reprocessing started.");
      queryClient.invalidateQueries({ queryKey: ["recording", id] });
    },
    onError: (e) =>
      toast(
        "error",
        e instanceof ApiRequestError ? e.error.message : "Request failed."
      ),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`recordings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
      toast("success", "Recording deleted.");
      router.push("/recordings");
    },
    onError: (e) => {
      setConfirmDelete(false);
      toast(
        "error",
        e instanceof ApiRequestError ? e.error.message : "Could not delete."
      );
    },
  });

  const rec = recording.data;
  const busy =
    rec &&
    !isLive &&
    (rec.status === "uploaded" || rec.status === "processing");
  const a = analysis.data;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/recordings"
        className="type-caption inline-flex items-center gap-1 font-medium text-accent hover:underline"
      >
        <Icon name="back" className="h-3.5 w-3.5" /> Recordings
      </Link>
      <header className="mt-3 mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {rec ? (
            <h1 className="type-title truncate">{rec.title}</h1>
          ) : (
            <Skeleton className="h-9 w-64" />
          )}
          <p className="mt-2 text-ink-2">
            {rec?.task_label?.replaceAll("_", " ") ?? "No task"}
            {rec && (
              <>
                {" · "}
                {formatDuration(rec.duration_s)}
                {" · "}
                {new Date(rec.created_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isLive && (
            <span className="inline-flex items-center gap-2 rounded-full bg-danger-soft px-3 py-1 text-[12px] font-semibold tracking-wide text-danger">
              <span
                className="relative h-2 w-2 rounded-full bg-danger"
                data-motion="status"
              >
                <span className="ping absolute inset-0 text-danger" />
              </span>
              LIVE
            </span>
          )}
          {rec && <StatusBadge status={rec.status} />}
        </div>
      </header>

      {busy && (
        <Card className="enter-up mb-6 flex items-center gap-4">
          <Spinner className="text-accent" />
          <div>
            <p className="font-medium">Processing your recording</p>
            <p className="type-caption text-ink-3">
              Cleaning, embedding and projecting
              {rec.job && rec.job.attempts > 1
                ? ` · attempt ${rec.job.attempts}`
                : ""}
              . This page updates by itself.
            </p>
          </div>
        </Card>
      )}

      {rec?.status === "failed" && (
        <Card className="enter-up mb-6 space-y-4">
          <ErrorBanner message="Processing failed." />
          {rec.job?.error && (
            <pre className="max-h-40 overflow-auto rounded-[var(--radius-control)] bg-surface-2 p-3 font-mono text-[12px] text-ink-2">
              {rec.job.error.slice(0, 800)}
            </pre>
          )}
          <Button
            onClick={() => reprocess.mutate("classic")}
            disabled={reprocess.isPending}
          >
            Retry
          </Button>
        </Card>
      )}

      {(rec?.status === "done" || isLive) && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-6">
            <section>
              <SectionTitle
                action={
                  isLive && (
                    <span className="type-caption text-ink-3">
                      Re-projects as the session grows
                    </span>
                  )
                }
              >
                Trail
              </SectionTitle>
              <Card className="p-3 sm:p-4">
                {analysis.isLoading && <Skeleton className="h-[460px]" />}
                {a && a.points.length >= 2 && <TrailPlot analysis={a} />}
                {isLive && (!a || a.points.length < 2) && (
                  <p className="flex h-[460px] items-center justify-center text-ink-3">
                    Waiting for the first windows, about four seconds of signal…
                  </p>
                )}
              </Card>
            </section>

            {rec?.status === "done" && rec.duration_s && (
              <section>
                <SectionTitle>Signal</SectionTitle>
                <Card>
                  <SignalPreview recordingId={id} durationS={rec.duration_s} />
                </Card>
              </section>
            )}
          </div>

          <aside className="space-y-6">
            <section>
              <SectionTitle>Analysis</SectionTitle>
              <Card inset>
                {a ? (
                  <>
                    <KeyValue label="Cleaner" value={a.cleaner_name} />
                    <KeyValue label="Embedder" value={a.embedder_name} />
                    <KeyValue label="Window" value={`${a.window_s} s`} />
                    <KeyValue label="Step" value={`${a.step_s} s`} />
                    <KeyValue label="Smoothing" value={`${a.smooth_s} s`} />
                    <KeyValue label="Points" value={a.points.length} />
                    {a.explained_variance.ratio && (
                      <KeyValue
                        label="Variance held"
                        value={`${Math.round(
                          (a.explained_variance.ratio[0] +
                            a.explained_variance.ratio[1]) *
                            100
                        )}%`}
                      />
                    )}
                  </>
                ) : (
                  <div className="space-y-2 p-5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                )}
              </Card>
              {a?.explained_variance.cleaner_notes?.length ? (
                <p className="type-caption mt-2 px-1 text-ink-3">
                  {a.explained_variance.cleaner_notes.join(" · ")}
                </p>
              ) : null}
            </section>

            {rec?.status === "done" && (
              <section>
                <SectionTitle>Actions</SectionTitle>
                <Card inset>
                  <ActionRow
                    label="Reprocess with classic cleaner"
                    onClick={() => reprocess.mutate("classic")}
                    disabled={reprocess.isPending}
                  />
                  <ActionRow
                    label="Reprocess without cleaning"
                    onClick={() => reprocess.mutate("identity")}
                    disabled={reprocess.isPending}
                  />
                  <ActionRow
                    label="Download raw file"
                    icon="download"
                    onClick={async () => {
                      const { url } = await api.get<{ url: string }>(
                        `recordings/${id}/download`
                      );
                      window.open(url, "_blank");
                    }}
                  />
                  <ActionRow
                    label="Delete recording"
                    icon="trash"
                    tone="danger"
                    onClick={() => setConfirmDelete(true)}
                  />
                </Card>
              </section>
            )}
          </aside>
        </div>
      )}

      {confirmDelete && (
        <Sheet
          title="Delete this recording?"
          onClose={() => setConfirmDelete(false)}
        >
          <p className="text-ink-2">
            The file, the analyses and the trail are removed for good. This
            cannot be undone.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
            <Button
              variant="danger"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </Sheet>
      )}
    </main>
  );
}

function ActionRow({
  label,
  onClick,
  disabled,
  icon = "chevron",
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: "chevron" | "download" | "trash";
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`pressable flex w-full items-center justify-between gap-3 border-b border-hairline px-5 py-3.5 text-left text-[15px] last:border-b-0 hover:bg-surface-2 disabled:opacity-50 ${
        tone === "danger" ? "text-danger" : "text-ink"
      }`}
    >
      {label}
      <Icon name={icon} className="text-ink-3" />
    </button>
  );
}
