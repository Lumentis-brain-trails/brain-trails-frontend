"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";
import { api } from "@/lib/api";
import type { Analysis, Recording } from "@/lib/types";
import { SignalPreview } from "@/components/SignalPreview";
import { StatusBadge } from "@/components/StatusBadge";
import { TrailPlot } from "@/components/TrailPlot";
import { Button, Card, ErrorBanner } from "@/components/ui";

export default function RecordingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const recording = useQuery({
    queryKey: ["recording", id],
    queryFn: () => api.get<Recording>(`recordings/${id}`),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "uploaded" || s === "processing" ? 2000 : false;
    },
  });

  const analysis = useQuery({
    queryKey: ["analysis", id, recording.data?.status],
    queryFn: () => api.get<Analysis>(`recordings/${id}/analysis`),
    enabled: recording.data?.status === "done",
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
        {rec && <StatusBadge status={rec.status} />}
      </header>

      {rec && (rec.status === "uploaded" || rec.status === "processing") && (
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
