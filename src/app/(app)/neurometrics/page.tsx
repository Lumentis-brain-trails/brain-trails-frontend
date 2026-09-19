"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import type { Recording } from "@/lib/types";
import { Card, EmptyState, Icon, Skeleton } from "@/components/ui";

/** Three minutes at one window per second: below this the dynamics are unmeasurable. */
const MIN_DURATION_S = 180;

/**
 * Pick a session to read the shape of.
 *
 * Only finished recordings can be swept, and only long ones say anything: a short
 * session is listed but not offered, with the reason in place of the link, because a
 * disabled row with no explanation reads as a bug.
 */
export default function NeuroMetricsIndexPage() {
  const recordings = useQuery({
    queryKey: ["recordings"],
    queryFn: () => api.get<Recording[]>("recordings"),
  });
  const done = recordings.data?.filter((r) => r.status === "done");

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="type-title">NeuroMetrics</h1>
        <p className="mt-1 max-w-2xl text-ink-2">
          The shape of a session rather than its path: which states it kept
          returning to, which crossings it passed through, and how quickly it
          forgot where it had been.
        </p>
      </header>

      {recordings.isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}

      {done && done.length === 0 && (
        <EmptyState
          title="Nothing to analyse yet"
          text="NeuroMetrics reads a finished recording. Record or upload a session of at least three minutes, then come back."
          action={
            <Link className="text-accent hover:underline" href="/recordings">
              Go to recordings
            </Link>
          }
        />
      )}

      {done && done.length > 0 && (
        <Card inset>
          {done.map((rec) => {
            const tooShort = (rec.duration_s ?? 0) < MIN_DURATION_S;
            const body = (
              <>
                <div className="min-w-0">
                  <p className="truncate font-medium">{rec.title}</p>
                  <p className="type-caption text-ink-3">
                    {rec.task_label?.replaceAll("_", " ") ?? "No task"} ·{" "}
                    {formatDuration(rec.duration_s)} ·{" "}
                    {new Date(rec.created_at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                {tooShort ? (
                  <span className="type-caption shrink-0 text-ink-3">
                    Too short
                  </span>
                ) : (
                  <Icon name="chevron" className="shrink-0 text-ink-3" />
                )}
              </>
            );

            return tooShort ? (
              <div
                key={rec.id}
                className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5 opacity-55 last:border-b-0"
              >
                {body}
              </div>
            ) : (
              <Link
                key={rec.id}
                href={`/neurometrics/${rec.id}`}
                className="pressable flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5 hover:bg-surface-2 last:border-b-0"
              >
                {body}
              </Link>
            );
          })}
        </Card>
      )}

      <p className="type-caption mt-6 text-ink-3">
        Exploratory, not diagnostic. These are descriptions of one recording,
        not measurements of a person.
      </p>
    </main>
  );
}
