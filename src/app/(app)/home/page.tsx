"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { formatDate, formatDuration } from "@/lib/format";
import type { Recording } from "@/lib/types";
import { TrailThumb } from "@/components/TrailThumb";
import { UploadDialog } from "@/components/UploadDialog";
import {
  Button,
  buttonClass,
  Card,
  EmptyState,
  Icon,
  Skeleton,
} from "@/components/ui";

const WEEK_MS = 7 * 24 * 3600 * 1000;
const RECENT = 4;

/**
 * Home: where a signed-in session starts. One way to begin a new trail (the only
 * place a ribbon appears inside the app: a trail is about to start there), the
 * week at a glance, and the latest trails drawn from their own data.
 */
export default function HomePage() {
  const [showUpload, setShowUpload] = useState(false);
  const recordings = useQuery({
    queryKey: ["recordings"],
    queryFn: () => api.get<Recording[]>("recordings"),
    refetchInterval: (query) =>
      query.state.data?.some(
        (r) => r.status === "uploaded" || r.status === "processing"
      )
        ? 2000
        : false,
  });
  const list = recordings.data ?? [];
  const recent = [...list]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, RECENT);
  // "This week" is fixed when the page opens, not re-evaluated every render.
  const [weekAgo] = useState(() => Date.now() - WEEK_MS);
  const thisWeek = list.filter((r) => +new Date(r.created_at) >= weekAgo);
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-12">
      <header className="enter-up mb-10">
        <p className="type-eyebrow text-ink-3" suppressHydrationWarning>
          {today}
        </p>
        <h1 className="type-display mt-2 text-[clamp(2.25rem,4.5vw,3rem)]">
          Welcome back.
        </h1>
      </header>

      <div className="stagger grid gap-5 lg:grid-cols-3">
        <Card className="relative isolate flex min-h-[250px] flex-col justify-between gap-8 overflow-hidden p-8 lg:col-span-2">
          <div
            aria-hidden
            className="ribbon-glow -top-[64px] -right-[150px] -z-10 rotate-[-18deg]"
          />
          <div>
            <h2 className="type-heading text-[26px] tracking-[-0.02em]">
              Start a new trail
            </h2>
            <p className="mt-2 text-ink-2">
              Wear the band, pick a stimulus, press record.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/record" className={buttonClass("primary", "lg")}>
              <span className="h-2 w-2 rounded-full bg-danger" aria-hidden />
              Record
            </Link>
            <Link href="/library" className={buttonClass("secondary", "lg")}>
              Pick a stimulus
            </Link>
            <Button variant="ghost" onClick={() => setShowUpload(true)}>
              <Icon name="plus" /> Upload a file
            </Button>
          </div>
        </Card>

        <Card className="flex flex-col p-7">
          <h2 className="type-eyebrow text-ink-3">This week</h2>
          <dl className="mt-5 flex flex-1 flex-col justify-between gap-4">
            <WeekRow label="Sessions" value={thisWeek.length} />
            <WeekRow
              label="Signal recorded"
              value={formatDuration(
                thisWeek.reduce((a, r) => a + (r.duration_s ?? 0), 0)
              )}
            />
            <WeekRow label="All sessions" value={list.length} last />
          </dl>
        </Card>
      </div>

      <section className="mt-12">
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 className="type-heading text-[22px]">Recent trails</h2>
          {list.length > RECENT && (
            <Link
              href="/recordings"
              className="text-[14px] font-medium text-ink-2 hover:text-ink"
            >
              All recordings
            </Link>
          )}
        </div>

        {recordings.isLoading && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[200px]" />
            ))}
          </div>
        )}
        {recordings.isError && (
          <Card>
            <p className="text-ink-2">Could not load recordings.</p>
          </Card>
        )}
        {recordings.isSuccess && list.length === 0 && (
          <Card inset>
            <EmptyState
              title="No trails yet."
              text="Record a session or upload a Muse file: its trail appears here."
              action={
                <Link href="/record" className={buttonClass()}>
                  Record your first session
                </Link>
              }
            />
          </Card>
        )}
        {recent.length > 0 && (
          <ul className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/recordings/${r.id}`}
                  className="pressable group block"
                >
                  <TrailThumb recording={r} />
                  <p className="mt-3 truncate font-semibold group-hover:underline">
                    {r.title}
                  </p>
                  <p className="type-caption mt-0.5 text-ink-3">
                    {formatDate(r.created_at)} · {formatDuration(r.duration_s)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showUpload && <UploadDialog onClose={() => setShowUpload(false)} />}
    </main>
  );
}

function WeekRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={
        "flex items-baseline justify-between gap-4" +
        (last ? "" : " border-b border-hairline pb-4")
      }
    >
      <dt className="text-[14px] text-ink-2">{label}</dt>
      <dd className="type-figure text-[24px]">{value}</dd>
    </div>
  );
}
