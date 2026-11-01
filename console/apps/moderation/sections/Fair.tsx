"use client";

/**
 * Running a stand (backend V3-0013).
 *
 * The page is meant to be read standing up, with one hand, while somebody waits: the
 * switch at the top, then the queue in the order people ticked, with the three things
 * you ever want to do to a row. Everything else is deliberately absent.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "@console/lib/product";
import { useErrorMessage } from "@/lib/errorMessage";
import { useToast } from "@/components/Toast";
import {
  Button,
  Card,
  ErrorBanner,
  SectionTitle,
  Skeleton,
  Stat,
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
  /** Asked after the demo, never at the door: the stand's conversion. */
  wants_beta: boolean;
}

/** A row nobody is waiting on any more: tried the headband, or left the queue. */
type ClosedRow = FairRow & { state: "done" | "declined" };

/** Blue, as Andrea asked: someone who has asked to be a beta tester. */
function BetaDot() {
  const t = useTranslations("admin.fair");
  return (
    <span
      title={t("wantsBeta")}
      aria-label={t("wantsBeta")}
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[#0a84ff]"
    />
  );
}

/**
 * How long ago, as the arguments of the catalogue's sentences (`calledAgo`,
 * `signedUp`) rather than as words: `when` picks the branch, `n` is its number of
 * minutes or hours (unused for `now`).
 */
function since(iso: string): { when: "now" | "minutes" | "hours"; n: number } {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return { when: "now", n: 0 };
  if (minutes < 60) return { when: "minutes", n: minutes };
  return { when: "hours", n: Math.round(minutes / 60) };
}

export function FairSection() {
  const t = useTranslations("admin.fair");
  const errorMessage = useErrorMessage();
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
    // No timer (backend decision 0014): an open tab must not keep the database awake.
    // The queue is read again on "Refresh" and after every act.
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.put("admin/fair", { enabled }),
    onSuccess: async (_d, enabled) => {
      toast("success", enabled ? t("open") : t("closed"));
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
          ? t("toast.emailed", { email: row.email })
          : what === "done"
            ? t("toast.done")
            : t("toast.declined")
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
    (r): r is ClosedRow => r.state === "done" || r.state === "declined"
  );
  const tried = rows.filter((r) => r.state === "done");
  const converted = tried.filter((r) => r.wants_beta).length;

  return (
    <div className="max-w-4xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="type-heading">{t("title")}</h2>
          <p className="mt-2 text-pretty text-ink-2">{t("intro")}</p>
        </div>
      </div>

      {error && (
        <div className="mb-6">
          <ErrorBanner message={errorMessage(error)} />
        </div>
      )}

      <Card className="mb-8 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="font-medium">
            {mode.data?.enabled ? t("open") : t("closed")}
          </p>
          <p className="type-caption text-ink-3">
            {mode.data?.enabled ? t("openHint") : t("closedHint")}
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
              ? t("closeAction")
              : t("openAction")}
        </Button>
      </Card>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={t("stats.waiting")}
          value={String(mode.data?.waiting ?? "–")}
        />
        <Stat
          label={t("stats.called")}
          value={String(mode.data?.called ?? "–")}
        />
        <Stat label={t("stats.done")} value={String(mode.data?.done ?? "–")} />
        <Stat
          label={t("stats.declined")}
          value={String(mode.data?.declined ?? "–")}
        />
      </div>
      {tried.length > 0 && (
        <p className="-mt-4 mb-8 flex items-center gap-2 text-[14px] text-ink-2">
          <BetaDot />
          {t("conversion", {
            converted,
            tried: tried.length,
            percent: Math.round((converted / tried.length) * 100),
          })}
        </p>
      )}

      <SectionTitle
        action={
          <Button
            size="sm"
            variant="secondary"
            disabled={queue.isFetching}
            onClick={() => void queue.refetch()}
          >
            {t("refresh")}
          </Button>
        }
      >
        {t("queue")}
      </SectionTitle>
      <Card inset>
        {queue.isLoading && (
          <div className="space-y-2 p-5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}
        {!queue.isLoading && live.length === 0 && (
          <p className="px-5 py-4 text-ink-3">{t("nobody")}</p>
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
                  {row.wants_beta && <BetaDot />}
                  {row.state === "called" && (
                    <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[12px] text-ok">
                      {t(
                        "calledAgo",
                        row.called_at
                          ? since(row.called_at)
                          : { when: "unknown", n: 0 }
                      )}
                    </span>
                  )}
                </span>
                <span className="type-caption block truncate pl-7 text-ink-3">
                  {t("signedUp", {
                    email: row.email,
                    ...since(row.signed_up_at),
                  })}
                </span>
              </span>
              <span className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => act.mutate({ row, what: "call" })}
                >
                  {row.state === "called" ? t("callAgain") : t("call")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => act.mutate({ row, what: "done" })}
                >
                  {t("done")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => act.mutate({ row, what: "declined" })}
                >
                  {t("gone")}
                </Button>
              </span>
            </div>
          );
        })}
      </Card>

      {closed.length > 0 && (
        <>
          <SectionTitle className="mt-8">{t("seenTo")}</SectionTitle>
          <Card inset>
            {closed.map((row) => (
              <div
                key={row.user_id}
                className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3 last:border-b-0"
              >
                <span className="flex min-w-0 items-center gap-2 text-ink-2">
                  <span className="truncate">{row.full_name ?? row.email}</span>
                  {row.wants_beta && <BetaDot />}
                </span>
                <span className="type-caption shrink-0 text-ink-3">
                  {t(`states.${row.state}`)}
                </span>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
