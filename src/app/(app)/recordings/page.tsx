"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import type { Recording } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { UploadDialog } from "@/components/UploadDialog";
import {
  Button,
  Card,
  EmptyState,
  Icon,
  Skeleton,
  Stat,
} from "@/components/ui";

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "–";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? `${m} min ${s} s` : `${s} s`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function RecordingsPage() {
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
  const list = recordings.data;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">Recordings</h1>
          <p className="mt-1 text-ink-2">Every session, one trail.</p>
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Icon name="plus" /> New recording
        </Button>
      </header>

      {list && list.length > 0 && (
        <div className="stagger mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Sessions" value={list.length} />
          <Stat
            label="Signal collected"
            value={formatDuration(
              list.reduce((a, r) => a + (r.duration_s ?? 0), 0)
            )}
          />
          <Stat
            label="Last upload"
            value={formatDate(
              new Date(
                Math.max(...list.map((r) => +new Date(r.created_at)))
              ).toISOString()
            )}
          />
        </div>
      )}

      {recordings.isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      )}
      {recordings.isError && (
        <Card>
          <p className="text-ink-2">Could not load recordings.</p>
        </Card>
      )}
      {list?.length === 0 && (
        <Card inset>
          <EmptyState
            title="No recordings yet."
            text="Upload a Muse EEG file to see your first trail."
            action={
              <Button onClick={() => setShowUpload(true)}>
                Upload your first recording
              </Button>
            }
          />
        </Card>
      )}
      {list && list.length > 0 && (
        <Card inset>
          <ul className="stagger divide-y divide-hairline">
            {list.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/recordings/${r.id}`}
                  className="pressable flex items-center gap-4 px-5 py-4 hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.title}</p>
                    <p className="type-caption mt-0.5 text-ink-3">
                      {r.task_label?.replaceAll("_", " ") ?? "No task"} ·{" "}
                      {formatDuration(r.duration_s)} ·{" "}
                      {formatDate(r.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                  <Icon name="chevron" className="text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {showUpload && <UploadDialog onClose={() => setShowUpload(false)} />}
    </main>
  );
}
