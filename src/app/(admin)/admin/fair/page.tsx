"use client";

/**
 * Running a stand (backend V3-0013).
 *
 * The page is meant to be read standing up, with one hand, while somebody waits: the
 * switch at the top, then the queue in the order people ticked, with the three things
 * you ever want to do to a row. Everything else is deliberately absent.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ApiRequestError, api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import {
  Button,
  Card,
  ErrorBanner,
  SectionTitle,
  Skeleton,
  Stat,
  buttonClass,
} from "@/components/ui";

interface FairMode {
  enabled: boolean;
  waiting: number;
  called: number;
  done: number;
  declined: number;
}

interface FairRow {
  user_id: string;
  email: string;
  full_name: string | null;
  state: "waiting" | "called" | "done" | "declined";
  signed_up_at: string;
  called_at: string | null;
}

const LABEL: Record<FairRow["state"], string> = {
  waiting: "waiting",
  called: "called",
  done: "done",
  declined: "not any more",
};

function since(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}

export default function AdminFairPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["fair-mode"] }),
      queryClient.invalidateQueries({ queryKey: ["fair-queue"] }),
    ]);

  const mode = useQuery({
    queryKey: ["fair-mode"],
    queryFn: () => api.get<FairMode>("admin/fair"),
  });
  const queue = useQuery({
    queryKey: ["fair-queue"],
    queryFn: () => api.get<FairRow[]>("admin/fair/queue"),
    // A stand moves; the page should not need reloading while somebody waits.
    refetchInterval: 30_000,
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.put("admin/fair", { enabled }),
    onSuccess: async (_d, enabled) => {
      toast("success", enabled ? "The stand is open." : "The stand is closed.");
      await refresh();
    },
  });

  const act = useMutation({
    mutationFn: ({
      row,
      what,
    }: {
      row: FairRow;
      what: "call" | "done" | "declined";
    }) =>
      what === "call"
        ? api.post(`admin/fair/queue/${row.user_id}/call`)
        : api.patch(`admin/fair/queue/${row.user_id}`, { state: what }),
    onSuccess: async (_d, { row, what }) => {
      toast(
        "success",
        what === "call"
          ? `Emailed ${row.email}.`
          : what === "done"
            ? "Marked done."
            : "Taken off the queue."
      );
      await refresh();
    },
  });

  const error = toggle.error ?? act.error;
  const rows = queue.data ?? [];
  const live = rows.filter(
    (r) => r.state === "waiting" || r.state === "called"
  );
  const closed = rows.filter(
    (r) => r.state === "done" || r.state === "declined"
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">The stand</h1>
          <p className="mt-2 text-pretty text-ink-2">
            While the stand is open, registration asks whether someone would
            like to try the headband. They can then walk away: calling them
            sends an email saying their turn is about five minutes off.
          </p>
        </div>
        <Link href="/admin" className={buttonClass("secondary")}>
          Back to admin
        </Link>
      </div>

      {error && (
        <div className="mb-6">
          <ErrorBanner
            message={
              error instanceof ApiRequestError
                ? error.error.message
                : "The request failed."
            }
          />
        </div>
      )}

      <Card className="mb-8 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="font-medium">
            {mode.data?.enabled ? "The stand is open." : "The stand is closed."}
          </p>
          <p className="type-caption text-ink-3">
            {mode.data?.enabled
              ? "New registrations are being asked the question."
              : "Closing does not empty the queue — people already in it keep their turn."}
          </p>
        </div>
        <Button
          variant={mode.data?.enabled ? "secondary" : "primary"}
          disabled={mode.isLoading || toggle.isPending}
          onClick={() => toggle.mutate(!mode.data?.enabled)}
        >
          {toggle.isPending
            ? "…"
            : mode.data?.enabled
              ? "Close the stand"
              : "Open the stand"}
        </Button>
      </Card>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Waiting" value={String(mode.data?.waiting ?? "–")} />
        <Stat label="Called" value={String(mode.data?.called ?? "–")} />
        <Stat label="Done" value={String(mode.data?.done ?? "–")} />
        <Stat label="Not any more" value={String(mode.data?.declined ?? "–")} />
      </div>

      <SectionTitle>In the queue</SectionTitle>
      <Card inset>
        {queue.isLoading && (
          <div className="space-y-2 p-5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}
        {!queue.isLoading && live.length === 0 && (
          <p className="px-5 py-4 text-ink-3">Nobody is waiting.</p>
        )}
        {live.map((row, i) => {
          const busy =
            act.isPending && act.variables?.row.user_id === row.user_id;
          return (
            <div
              key={row.user_id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3.5 last:border-b-0"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="w-5 shrink-0 tabular-nums text-ink-3">
                    {i + 1}
                  </span>
                  <span className="truncate font-medium">
                    {row.full_name ?? row.email}
                  </span>
                  {row.state === "called" && (
                    <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[12px] text-ok">
                      {LABEL.called}
                      {row.called_at ? ` ${since(row.called_at)}` : ""}
                    </span>
                  )}
                </span>
                <span className="type-caption block truncate pl-7 text-ink-3">
                  {row.email} · signed up {since(row.signed_up_at)}
                </span>
              </span>
              <span className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => act.mutate({ row, what: "call" })}
                >
                  {row.state === "called" ? "Call again" : "Call"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => act.mutate({ row, what: "done" })}
                >
                  Done
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => act.mutate({ row, what: "declined" })}
                >
                  Gone
                </Button>
              </span>
            </div>
          );
        })}
      </Card>

      {closed.length > 0 && (
        <>
          <SectionTitle className="mt-8">Seen to</SectionTitle>
          <Card inset>
            {closed.map((row) => (
              <div
                key={row.user_id}
                className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3 last:border-b-0"
              >
                <span className="min-w-0 truncate text-ink-2">
                  {row.full_name ?? row.email}
                </span>
                <span className="type-caption shrink-0 text-ink-3">
                  {LABEL[row.state]}
                </span>
              </div>
            ))}
          </Card>
        </>
      )}
    </main>
  );
}
