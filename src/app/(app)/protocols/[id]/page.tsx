"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";
import { ApiRequestError, api } from "@/lib/api";
import {
  type ProtocolDetail,
  type ValidationResult,
  formatMinutes,
  isPlayable,
} from "@/lib/protocol/catalog";
import {
  Button,
  buttonClass,
  Card,
  ErrorBanner,
  KeyValue,
  Skeleton,
} from "@/components/ui";
import { useToast } from "@/components/Toast";

const KIND_WORDS: Record<string, string> = {
  instructions: "Instructions",
  prompt: "Instructions",
  fixation: "Fixation cross",
  baseline: "Resting baseline",
  rest: "Rest",
  countdown: "Countdown",
  video: "Video",
  audio: "Sound",
  text: "Reading",
  questionnaire: "Questionnaire",
  quiz: "Quiz",
  breathing: "Paced breathing",
  "go-no-go": "Go/no-go game",
  "image-sequence": "Images",
  group: "Group",
};

const errorText = (e: unknown) =>
  e instanceof ApiRequestError
    ? e.error.message
    : e instanceof Error
      ? e.message
      : String(e);

/**
 * A protocol's page (V3-0004, S16-S18): what it does, how long it takes, the blocks in
 * plain words, the content warning - then Play, which goes through consent and the
 * headband pre-flight to the run. A locked protocol is shown but cannot be played.
 *
 * For its author it is also where a draft is checked and published (the timeline
 * builder is S19): Publish validates and freezes the draft as the next version, and the
 * errors and warnings come back here.
 */
export default function ProtocolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const item = useQuery({
    queryKey: ["protocol", id],
    queryFn: () => api.get<ProtocolDetail>(`protocols/${id}`),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["protocol", id] });
    void queryClient.invalidateQueries({ queryKey: ["protocols"] });
  };

  const check = useMutation({
    mutationFn: () =>
      api.post<ValidationResult>(`protocols/${id}/validate`, {}),
  });
  const publish = useMutation({
    mutationFn: () => api.post<ProtocolDetail>(`protocols/${id}/publish`, {}),
    onSuccess: () => {
      toast("success", "Published: it is ready to play.");
      refresh();
    },
    onError: () => check.mutate(),
  });
  const duplicate = useMutation({
    mutationFn: () => api.post<ProtocolDetail>(`protocols/${id}/duplicate`, {}),
    onSuccess: (copy) => router.push(`/protocols/${copy.id}`),
  });
  const share = useMutation({
    mutationFn: () => api.post<ProtocolDetail>(`protocols/${id}/share`, {}),
    onSuccess: (p) => {
      toast(
        "success",
        p.review_state === "pending"
          ? "Sent for review: it appears in Community once approved."
          : "Shared with the community."
      );
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete<{ status: string }>(`protocols/${id}`),
    onSuccess: (r) => {
      toast(
        "success",
        r.status === "archived"
          ? "Archived: your past sessions keep it."
          : "Deleted."
      );
      void queryClient.invalidateQueries({ queryKey: ["protocols"] });
      router.push("/protocols");
    },
  });

  if (item.isPending)
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Skeleton className="aspect-video w-full rounded-[var(--radius-card)]" />
        <Skeleton className="mt-4 h-7 w-1/2" />
      </main>
    );

  if (item.isError || !item.data)
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <ErrorBanner message="This protocol is not in your catalog." />
        <div className="mt-6">
          <Link href="/protocols" className={buttonClass("secondary")}>
            Back to protocols
          </Link>
        </div>
      </main>
    );

  const p = item.data;
  const locked = p.access === "locked";
  const playable = isPlayable(p);
  const draftChanged =
    p.mine &&
    p.draft !== null &&
    JSON.stringify(p.draft) !== JSON.stringify(p.definition);
  const report = check.data;
  const mutationError =
    publish.error ?? duplicate.error ?? share.error ?? remove.error;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      {p.preview_url ? (
        <video
          src={p.preview_url}
          poster={p.cover_url ?? undefined}
          muted
          loop
          autoPlay
          playsInline
          className="aspect-video w-full rounded-[var(--radius-card)] border border-hairline bg-black object-cover"
        />
      ) : p.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL
        <img
          src={p.cover_url}
          alt=""
          className="aspect-video w-full rounded-[var(--radius-card)] border border-hairline object-cover"
        />
      ) : null}

      <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="type-title">{p.title}</h1>
          <p className="type-caption mt-1 text-ink-3">
            {p.visibility === "official"
              ? "Official"
              : p.visibility === "public"
                ? "Community"
                : "Your workspace"}
            {p.current_version
              ? ` · version ${p.current_version}`
              : " · draft, not published"}
            {p.review_state === "pending" && " · waiting for review"}
          </p>
        </div>
        {playable ? (
          <Link href={`/protocols/${p.id}/run`} className={buttonClass()}>
            Play
          </Link>
        ) : (
          <Button
            disabled
            title={
              locked ? "Not open yet: beta testers get this first" : undefined
            }
          >
            {locked ? "Locked" : "Not published"}
          </Button>
        )}
      </header>

      {(p.summary || p.description) && (
        <p className="mt-4 text-pretty text-ink-2">
          {p.description ?? p.summary}
        </p>
      )}

      {p.content_warning && (
        <Card className="mt-6 border-warn/40 bg-warn-soft">
          <h2 className="text-[15px] font-semibold">Before you start</h2>
          <p className="mt-1 text-ink-2">{p.content_warning}</p>
          <p className="type-caption mt-2 text-ink-3">
            You can stop at any point.
          </p>
        </Card>
      )}

      {p.outline.length > 0 && (
        <Card className="mt-6">
          <h2 className="text-[15px] font-semibold">What happens</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-2">
            {p.outline.map((step, i) => (
              <li key={i}>
                {step.label}
                <span className="text-ink-3">
                  {" — "}
                  {KIND_WORDS[step.kind] ?? step.kind}
                  {step.count > 1 && ` ×${step.count}`}
                  {step.duration_s ? `, ${formatMinutes(step.duration_s)}` : ""}
                </span>
              </li>
            ))}
          </ol>
          <p className="type-caption mt-3 text-ink-3">
            You wear the headband throughout; the recording starts and stops
            with the session.
          </p>
        </Card>
      )}

      <Card className="mt-6" inset>
        <KeyValue
          label="Duration"
          value={formatMinutes(p.est_duration_s) ?? "–"}
        />
        <KeyValue
          label="Added"
          value={new Date(p.created_at).toLocaleDateString()}
        />
      </Card>

      {p.mine && (
        <Card className="mt-6 space-y-4">
          <div>
            <h2 className="text-[15px] font-semibold">Your protocol</h2>
            <p className="type-caption mt-1 text-ink-3">
              {p.current_version === null
                ? "Publish it to play it. Publishing checks it first."
                : draftChanged
                  ? "The draft has changes that are not published yet."
                  : "Published. Sessions keep the version they ran."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(p.current_version === null || draftChanged) && (
              <Button
                onClick={() => publish.mutate()}
                disabled={publish.isPending}
              >
                Publish
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => check.mutate()}
              disabled={check.isPending}
            >
              Check
            </Button>
            {p.visibility === "workspace" &&
              p.current_version !== null &&
              p.review_state !== "pending" && (
                <Button
                  variant="secondary"
                  onClick={() => share.mutate()}
                  disabled={share.isPending}
                >
                  Share with the community
                </Button>
              )}
            <Button
              variant="ghost"
              onClick={() => {
                if (window.confirm(`Delete “${p.title}”?`)) remove.mutate();
              }}
            >
              Delete
            </Button>
          </div>
          {report && <Findings report={report} />}
        </Card>
      )}

      {!p.mine && p.current_version !== null && (
        <div className="mt-6">
          <Button variant="secondary" onClick={() => duplicate.mutate()}>
            Make a copy to edit
          </Button>
        </div>
      )}

      {mutationError && (
        <div className="mt-4">
          <ErrorBanner message={errorText(mutationError)} />
        </div>
      )}
    </main>
  );
}

function Findings({ report }: { report: ValidationResult }) {
  if (report.ok && report.warnings.length === 0)
    return (
      <p className="type-caption text-ok">
        No problems found · {formatMinutes(report.est_duration_s)}
      </p>
    );
  return (
    <ul className="space-y-1 text-[14px]">
      {report.errors.map((e, i) => (
        <li key={`e${i}`} className="text-danger">
          {e.message} <span className="text-ink-3">({e.path})</span>
        </li>
      ))}
      {report.warnings.map((w, i) => (
        <li key={`w${i}`} className="text-warn">
          {w.message}
        </li>
      ))}
    </ul>
  );
}
