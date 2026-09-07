"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";

interface Stats {
  users_by_status: Record<string, number>;
  recordings: {
    count: number;
    total_minutes: number;
    by_task: Record<string, number>;
    by_source: Record<string, number>;
    per_day: { day: string; count: number }[];
  };
  jobs_by_status: Record<string, number>;
}

interface UserRow {
  id: string;
  email: string;
  status: string;
  member_since: string;
  recordings: number;
  total_minutes: number;
  last_activity: string | null;
}

const BAR = "#4f46e5"; // single-series charts: one hue, identity lives in the row labels

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="py-4">
      <p className="text-xs uppercase tracking-wide text-neutral-400">
        {label}
      </p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </Card>
  );
}

function BarRow({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-36 shrink-0 truncate text-neutral-500">{label}</span>
      <div className="h-4 flex-1 rounded bg-neutral-100 dark:bg-neutral-800">
        <div
          className="h-full rounded"
          style={{
            width: `${max ? (value / max) * 100 : 0}%`,
            background: BAR,
          }}
          title={`${label}: ${value}`}
        />
      </div>
      <span className="w-8 text-right tabular-nums">{value}</span>
    </div>
  );
}

export default function AdminDashboardPage() {
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api.get<Stats>("admin/stats"),
  });
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<UserRow[]>("admin/users"),
  });

  const s = stats.data;
  const maxTask = s ? Math.max(1, ...Object.values(s.recordings.by_task)) : 1;
  const days = s ? [...s.recordings.per_day].reverse() : [];
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin dashboard</h1>
          <p className="text-sm text-neutral-500">
            Input statistics across all participants.
          </p>
        </div>
        <Link
          href="/admin/registrations"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Review registrations
          {s?.users_by_status?.pending ? ` (${s.users_by_status.pending})` : ""}
        </Link>
      </header>

      {stats.isLoading && <Card>Loading...</Card>}
      {s && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Tile
              label="Active users"
              value={String(s.users_by_status.active ?? 0)}
            />
            <Tile
              label="Pending review"
              value={String(s.users_by_status.pending ?? 0)}
              hint={`${s.users_by_status.rejected ?? 0} rejected`}
            />
            <Tile
              label="Recordings"
              value={String(s.recordings.count)}
              hint={`${s.recordings.by_source.stream ?? 0} live sessions`}
            />
            <Tile
              label="Signal collected"
              value={`${s.recordings.total_minutes}m`}
              hint={`jobs failed: ${s.jobs_by_status.failed ?? 0}`}
            />
          </div>

          <div className="mb-6 grid gap-6 md:grid-cols-2">
            <Card>
              <h2 className="mb-3 text-sm font-semibold">Recordings by task</h2>
              <div className="space-y-2">
                {Object.entries(s.recordings.by_task)
                  .sort((a, b) => b[1] - a[1])
                  .map(([task, count]) => (
                    <BarRow
                      key={task}
                      label={task.replaceAll("_", " ")}
                      value={count}
                      max={maxTask}
                    />
                  ))}
                {Object.keys(s.recordings.by_task).length === 0 && (
                  <p className="text-sm text-neutral-400">No recordings yet.</p>
                )}
              </div>
            </Card>
            <Card>
              <h2 className="mb-3 text-sm font-semibold">
                Uploads per day (last 14)
              </h2>
              {days.length === 0 ? (
                <p className="text-sm text-neutral-400">No uploads yet.</p>
              ) : (
                <div
                  className="flex h-36 items-end gap-1"
                  role="img"
                  aria-label="uploads per day"
                >
                  {days.map((d) => (
                    <div
                      key={d.day}
                      className="group flex flex-1 flex-col items-center gap-1"
                    >
                      <span className="text-[10px] tabular-nums text-neutral-400 opacity-0 transition group-hover:opacity-100">
                        {d.count}
                      </span>
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: `${(d.count / maxDay) * 100}%`,
                          minHeight: 3,
                          background: BAR,
                        }}
                        title={`${d.day}: ${d.count}`}
                      />
                      <span className="text-[9px] text-neutral-400">
                        {d.day.slice(8)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 text-left dark:border-neutral-800">
                <tr>
                  <th className="p-3">Participant</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Recordings</th>
                  <th className="p-3 text-right">Minutes</th>
                  <th className="p-3">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {users.data?.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-neutral-100 last:border-0 dark:border-neutral-800"
                  >
                    <td className="p-3">{u.email}</td>
                    <td className="p-3 text-neutral-500">{u.status}</td>
                    <td className="p-3 text-right tabular-nums">
                      {u.recordings}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {u.total_minutes}
                    </td>
                    <td className="p-3 text-neutral-500">
                      {u.last_activity
                        ? new Date(u.last_activity).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </main>
  );
}
