"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";
import { api } from "@/lib/api";
import type { Analysis, Recording } from "@/lib/types";
import { SignalPreview } from "@/components/SignalPreview";
import { StatusBadge } from "@/components/StatusBadge";
import { TrailPlot } from "@/components/TrailPlot";
import { Button, Card, ErrorBanner } from "@/components/ui";
import { useToast } from "@/components/Toast";

export default function RecordingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();

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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["recording", id] }),
  });

  const rec = recording.data;
  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/recordings"
            className="text-sm text-indigo-600 hover:underline"
          >
            &larr; recordings
          </Link>
          <h1 className="text-2xl font-bold">{rec?.title ?? "..."}</h1>
          <p className="text-sm text-neutral-500">
            {rec?.task_label?.replaceAll("_", " ") ?? "no task"} ·{" "}
            {rec ? new Date(rec.created_at).toLocaleString() : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              LIVE
            </span>
          )}
          {rec && <StatusBadge status={rec.status} />}
        </div>
      </header>

      {isLive && (
        <Card className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Trail - growing live</h2>
            <span className="text-xs text-neutral-500">
              adaptive PCA: the whole trail re-projects as the session evolves
            </span>
          </div>
          {analysis.data && analysis.data.points.length >= 2 ? (
            <TrailPlot analysis={analysis.data} />
          ) : (
            <p className="text-sm text-neutral-400">
              Waiting for the first windows (about 4 seconds of signal)...
            </p>
          )}
        </Card>
      )}
      {rec &&
        !isLive &&
        (rec.status === "uploaded" || rec.status === "processing") && (
          <Card className="mb-6 text-sm text-neutral-500">
            Processing your recording
            {rec.job ? ` (attempt ${rec.job.attempts || 1})` : ""}... this page
            updates automatically.
          </Card>
        )}

      {rec?.status === "failed" && (
        <Card className="mb-6 space-y-3">
          <ErrorBanner message="Processing failed." />
          {rec.job?.error && (
            <pre className="max-h-40 overflow-auto rounded bg-neutral-50 p-2 text-xs dark:bg-neutral-800">
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

      {rec?.status === "done" && (
        <>
          <Card className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Trail</h2>
              {analysis.data && (
                <span className="text-xs text-neutral-500">
                  {analysis.data.cleaner_name} + {analysis.data.embedder_name} ·
                  window {analysis.data.window_s}s · smooth{" "}
                  {analysis.data.smooth_s}s
                </span>
              )}
            </div>
            {analysis.isLoading && (
              <p className="text-sm text-neutral-400">Loading analysis...</p>
            )}
            {analysis.data && <TrailPlot analysis={analysis.data} />}
            {analysis.data && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {[
                  `cleaner: ${analysis.data.cleaner_name} v${analysis.data.cleaner_version}`,
                  `embedder: ${analysis.data.embedder_name}`,
                  `window ${analysis.data.window_s}s / step ${analysis.data.step_s}s`,
                  `smoothing ${analysis.data.smooth_s}s`,
                ].map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full bg-neutral-100 px-2 py-1 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}
          </Card>
          <Card className="mb-6">
            <h2 className="mb-2 font-semibold">Signal</h2>
            {rec.duration_s && (
              <SignalPreview recordingId={id} durationS={rec.duration_s} />
            )}
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Actions</h2>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                onClick={() => reprocess.mutate("classic")}
                disabled={reprocess.isPending}
              >
                Reprocess (classic cleaner)
              </Button>
              <Button
                variant="ghost"
                onClick={() => reprocess.mutate("identity")}
                disabled={reprocess.isPending}
              >
                Reprocess (no cleaning)
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  const { url } = await api.get<{ url: string }>(
                    `recordings/${id}/download`
                  );
                  window.open(url, "_blank");
                }}
              >
                Download raw file
              </Button>
            </div>
            {reprocess.isError && (
              <p className="mt-2 text-xs text-red-500">
                {(reprocess.error as Error).message}
              </p>
            )}
          </Card>
        </>
      )}
    </main>
  );
}
