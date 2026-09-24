"use client";

/**
 * A recording: the page you land on, and the only one there is for reading it back.
 *
 * A finished recording opens on the comparison view - two blocks of its protocol side
 * by side, each with its trail, what was on screen, and the rows the reader chooses
 * (`components/compare/CompareView`). The review page and the NeuroMetrics page it
 * replaces now redirect here. A recording without protocol blocks shows its whole trail
 * instead, a live one its trail as it grows, and one still processing says so.
 *
 * Everything else a recording page used to lead with - the raw signal, how the trail
 * was computed, reprocessing, the raw file - is still here, below the comparison, for
 * whoever wants it.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useMemo, useState } from "react";
import { ApiRequestError, api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import type { BandSeries } from "@/components/compare/MetricCell";
import { CompareView, type PlanStep } from "@/components/compare/CompareView";
import { formatDuration } from "@/lib/format";
import type { BlockMetrics } from "@/lib/compare/rows";
import type { WireEvent } from "@/lib/protocol/marker";
import {
  mediaTimeAt,
  mediaWindows,
  parseTimeline,
  runBlocks,
} from "@/lib/review/timeline";
import type { Analysis, Recording } from "@/lib/types";
import { Sheet } from "@/components/Sheet";
import type { ApplicationData } from "@/components/account/BetaCard";
import { BetaPrompt } from "@/components/account/BetaPrompt";
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

type SessionDetail = components["schemas"]["SessionOut"];
type MediaLinks = components["schemas"]["MediaLinks"];
type Features = components["schemas"]["FeaturesOut"];

/** How many points a band line across the session is worth. */
const MAX_POINTS = 600;

export default function RecordingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const tr = useTranslations("compare");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const recording = useQuery({
    queryKey: ["recording", id],
    queryFn: () => api.get<Recording>(`recordings/${id}`),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "uploaded" || s === "processing" ? 2000 : false;
    },
  });

  const rec = recording.data;
  const done = rec?.status === "done";
  const isLive = rec?.source === "stream" && rec?.status === "processing";
  const sessionId = rec?.session_id ?? null;

  const analysis = useQuery({
    queryKey: ["analysis", id, rec?.status],
    queryFn: () => api.get<Analysis>(`recordings/${id}/analysis`),
    enabled: done || isLive,
    refetchInterval: isLive ? 1500 : false,
    retry: isLive,
  });
  const blocks = useQuery({
    queryKey: ["blocks", id],
    queryFn: () => api.get<BlockMetrics[]>(`recordings/${id}/blocks`),
    enabled: done,
    retry: false,
  });
  const session = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.get<SessionDetail>(`sessions/${sessionId}`),
    enabled: done && sessionId !== null,
  });
  const links = useQuery({
    queryKey: ["session", sessionId, "media"],
    queryFn: () => api.get<MediaLinks>(`sessions/${sessionId}/media-urls`),
    enabled: done && sessionId !== null,
  });
  // `downsample` folds every k windows into one: one window a second, so k keeps a band
  // line at about MAX_POINTS whatever the length.
  const fold = Math.max(1, Math.ceil((rec?.duration_s ?? 0) / MAX_POINTS));
  const features = useQuery({
    queryKey: ["features", id, fold],
    queryFn: () =>
      api.get<Features>(`recordings/${id}/features?downsample=${fold}`),
    enabled: done,
    retry: false,
  });
  // The stored timeline is a presigned object, not an API route: fetch it directly.
  const timeline = useQuery({
    queryKey: ["timeline", session.data?.events_url],
    queryFn: async () => {
      const url = session.data?.events_url;
      if (!url) return [] as WireEvent[];
      return parseTimeline(await (await fetch(url)).text());
    },
    enabled: Boolean(session.data?.events_url),
    staleTime: Infinity,
  });

  const events = useMemo(() => timeline.data ?? [], [timeline.data]);
  const plan = session.data?.resolved_plan as
    | { steps?: (PlanStep & { id: string; block?: { block_id?: string } })[] }
    | null
    | undefined;
  const steps = useMemo(() => {
    const out: Record<string, PlanStep> = {};
    for (const step of plan?.steps ?? []) {
      const blockId = step.block?.block_id;
      if (blockId && !(blockId in out)) out[blockId] = step;
    }
    return out;
  }, [plan]);
  const windows = useMemo(
    () => mediaWindows(events, runBlocks(events, plan)),
    [events, plan]
  );
  const videoAt = useCallback(
    (t: number) => {
      const at = mediaTimeAt(windows, t);
      const media = at?.mediaId ? links.data?.media[at.mediaId] : undefined;
      return at && media?.url
        ? { url: media.url, poster: media.poster_url, time: at.mediaTime }
        : null;
    },
    [links.data, windows]
  );
  const bands = useMemo(() => bandSeries(features.data), [features.data]);

  // Same query as the account page, so applying there is seen here without a refetch.
  const application = useQuery({
    queryKey: ["me-application"],
    queryFn: () => api.get<ApplicationData>("auth/me/application"),
    retry: false,
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

  const busy =
    rec &&
    !isLive &&
    (rec.status === "uploaded" || rec.status === "processing");
  const a = analysis.data;
  const rows = blocks.data ?? [];
  const comparing = done && a && a.points.length >= 2 && rows.length > 0;
  const loadingComparison =
    done && (analysis.isLoading || blocks.isLoading || session.isLoading);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/recordings"
        className="type-caption inline-flex items-center gap-1 font-medium text-accent hover:underline"
      >
        <Icon name="back" className="h-3.5 w-3.5" /> Recordings
      </Link>
      <header className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {rec ? (
            <h1 className="type-title truncate">{rec.title}</h1>
          ) : (
            <Skeleton className="h-9 w-64" />
          )}
          <p className="mt-2 text-ink-2">
            {session.data?.title ??
              rec?.task_label?.replaceAll("_", " ") ??
              "No protocol"}
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

      {rec?.status === "empty" && (
        <div className="mb-6">
          <ErrorBanner message="No EEG was recorded in this session: it ended before the headband sent any data." />
        </div>
      )}
      {rec?.status === "capturing" && (
        <div className="mb-6">
          <ErrorBanner message="This session is still recording, or was closed before it finished. It is closed automatically after three hours." />
        </div>
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

      {loadingComparison && <Skeleton className="h-[520px]" />}

      {comparing && (
        <CompareView
          analysis={a}
          blocks={rows}
          events={events}
          steps={steps}
          bands={bands}
          videoAt={videoAt}
        />
      )}

      {(isLive || (done && !loadingComparison && !comparing)) && (
        <section className="space-y-3">
          {done && <p className="text-ink-2">{tr("noBlocks")}</p>}
          <Card className="p-3 sm:p-4">
            {a && a.points.length >= 2 ? (
              <TrailPlot analysis={a} />
            ) : (
              <p className="flex h-[460px] items-center justify-center text-ink-3">
                Waiting for the first windows, about four seconds of signal…
              </p>
            )}
          </Card>
        </section>
      )}

      {done && (
        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_300px]">
          <details className="group">
            <summary className="type-caption cursor-pointer px-1 font-medium text-ink-3 hover:text-ink">
              Signal and technical details
            </summary>
            <div className="mt-3 space-y-4">
              {rec?.duration_s ? (
                <Card>
                  <SignalPreview recordingId={id} durationS={rec.duration_s} />
                </Card>
              ) : null}
              {a && (
                <Card inset>
                  <KeyValue label="Cleaner" value={a.cleaner_name} />
                  <KeyValue label="Embedder" value={a.embedder_name} />
                  <KeyValue label="Window" value={`${a.window_s} s`} />
                  <KeyValue label="Step" value={`${a.step_s} s`} />
                  <KeyValue label="Points" value={a.points.length} />
                  {a.landscape && (
                    <KeyValue label="Regions" value={a.landscape.n_nodes} />
                  )}
                </Card>
              )}
            </div>
          </details>

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
        </div>
      )}

      {/* last in the report: the beta question waits until it has been read to the end */}
      {done && <BetaPrompt wantsBeta={application.data?.wants_beta ?? null} />}

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

/** Each band's relative power across the session, the channels averaged per window. */
function bandSeries(
  features: Features | undefined
): Record<string, BandSeries> | null {
  if (!features) return null;
  const out: Record<string, BandSeries> = {};
  for (const [name, perWindow] of Object.entries(features.bands_rel)) {
    out[name] = {
      t: features.t,
      values: perWindow.map((channels) =>
        channels.length
          ? channels.reduce((sum, v) => sum + v, 0) / channels.length
          : 0
      ),
    };
  }
  return out;
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
