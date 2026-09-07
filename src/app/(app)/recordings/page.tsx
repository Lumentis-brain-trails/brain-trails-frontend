"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import type { Recording } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { UploadDialog } from "@/components/UploadDialog";
import { Button, Card } from "@/components/ui";

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "-";
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
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

  return (
    <main className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your recordings</h1>
        <Button onClick={() => setShowUpload(true)}>Upload recording</Button>
      </header>

      {recordings.isLoading && <Card>Loading...</Card>}
      {recordings.isError && <Card>Could not load recordings.</Card>}
      {recordings.data?.length === 0 && (
        <Card className="text-center">
          <p className="mb-3 text-sm text-neutral-500">
            No recordings yet. Upload a Muse EEG file to see your first trail.
          </p>
          <Button onClick={() => setShowUpload(true)}>
            Upload your first recording
          </Button>
        </Card>
      )}
      {recordings.data && recordings.data.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left dark:border-neutral-800">
              <tr>
                <th className="p-3">Title</th>
                <th className="p-3">Task</th>
                <th className="p-3">Duration</th>
                <th className="p-3">Status</th>
                <th className="p-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {recordings.data.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
                >
                  <td className="p-3">
                    <Link
                      href={`/recordings/${r.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className="p-3 text-neutral-500">
                    {r.task_label?.replaceAll("_", " ") ?? "-"}
                  </td>
                  <td className="p-3">{formatDuration(r.duration_s)}</td>
                  <td className="p-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="p-3 text-neutral-500">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {showUpload && <UploadDialog onClose={() => setShowUpload(false)} />}
    </main>
  );
}
