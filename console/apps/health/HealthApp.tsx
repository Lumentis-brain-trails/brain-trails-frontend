"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  Select,
  cn,
} from "@/components/ui";
import { Age } from "@console/components/Age";
import { SnapshotPanel } from "@console/components/SnapshotPanel";
import { useErrorText } from "@console/components/useErrorText";
import { useSnapshot } from "@console/components/data";
import { type Schemas, ops, query } from "@console/lib/client";
import type { AppPageProps } from "@console/lib/manifest";
import {
  type Container,
  type JobsPayload,
  type PodsPayload,
  STATUSES,
  logTargets,
  memoryLevel,
  mib,
  shortId,
  since,
  sortPods,
} from "./lib/health";

type LogOut = Schemas["LogOut"];

interface LogTarget {
  pod: string;
  container: string;
  previous: boolean;
}

/** An age, or a dash when nothing was measured. */
function Ago({ seconds }: { seconds: number | null }) {
  return seconds === null ? <span>–</span> : <Age seconds={seconds} />;
}

/** The definitions behind a panel's words, folded under it: the page says what it counts. */
function Definitions({ items }: { items: string[] }) {
  const t = useTranslations("console.health");
  return (
    <details className="border-t border-hairline px-5 py-3 text-[13px] text-ink-2">
      <summary className="cursor-pointer text-ink-3">
        {t("definitions")}
      </summary>
      <ul className="mt-2 grid gap-1.5">
        {items.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </details>
  );
}

/** A figure with its label, for the row on top of a panel. */
function Figure({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div>
      <p className="text-[12px] text-ink-3">{label}</p>
      <p
        className={cn(
          "font-mono text-[20px] tabular-nums",
          alert ? "text-danger" : "text-ink"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function JobsBody({ p, age }: { p: JobsPayload; age: number }) {
  const t = useTranslations("console.health.jobs");
  const kinds = Object.keys(p.queue);
  return (
    <>
      <div className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-5">
        <Figure label={t("queued")} value={p.queued} />
        <Figure
          label={t("oldestQueued")}
          value={<Ago seconds={since(p.oldest_queued_s, age)} />}
        />
        <Figure
          label={t("stale")}
          value={p.stale.length}
          alert={p.stale.length > 0}
        />
        <Figure
          label={t("loops")}
          value={p.retry_loops.length}
          alert={p.retry_loops.length > 0}
        />
        <Figure
          label={t("failed24h")}
          value={p.failed_24h}
          alert={p.failed_24h > 0}
        />
      </div>
      {kinds.length > 0 && (
        <div className="overflow-x-auto px-5 pb-4">
          <table className="w-full text-[14px]">
            <thead className="text-left text-[12px] text-ink-3">
              <tr>
                <th className="pb-2 font-medium">{t("kind")}</th>
                {STATUSES.map((s) => (
                  <th key={s} className="pb-2 text-right font-medium">
                    {t(`status.${s}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {kinds.map((kind) => (
                <tr key={kind} className="border-t border-hairline">
                  <td className="py-2 pr-3 font-mono text-[13px]">{kind}</td>
                  {STATUSES.map((s) => (
                    <td key={s} className="py-2 text-right tabular-nums">
                      {p.queue[kind][s] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <JobList
        title={t("staleTitle", { minutes: p.stale_minutes })}
        rows={p.stale.map((j) => ({
          id: j.id,
          kind: j.kind,
          attempts: j.attempts,
          when: since(j.locked_for_s, age),
          error: null,
        }))}
      />
      <JobList
        title={t("loopsTitle")}
        rows={p.retry_loops.map((j) => ({
          id: j.id,
          kind: `${j.kind} · ${t(`status.${j.status as (typeof STATUSES)[number]}`)}`,
          attempts: j.attempts,
          when: null,
          error: j.error,
        }))}
      />
      <JobList
        title={t("failuresTitle")}
        rows={p.failures.map((j) => ({
          id: j.id,
          kind: j.kind,
          attempts: j.attempts,
          when: null,
          finished: j.finished_at,
          error: j.error,
        }))}
      />
      <Definitions
        items={[
          t("def.queue"),
          t("def.oldest"),
          t("def.stale", { minutes: p.stale_minutes }),
          t("def.loop", { attempts: p.max_attempts }),
          t("def.failed"),
        ]}
      />
    </>
  );
}

function JobList({
  title,
  rows,
}: {
  title: string;
  rows: {
    id: string;
    kind: string;
    attempts: number;
    when: number | null;
    finished?: string | null;
    error: string | null;
  }[];
}) {
  const t = useTranslations("console.health.jobs");
  if (rows.length === 0) return null;
  return (
    <div className="border-t border-hairline px-5 py-3">
      <h3 className="mb-2 text-[13px] font-semibold text-ink-2">{title}</h3>
      <ul className="grid gap-2">
        {rows.map((r) => (
          <li key={r.id} className="text-[13px]">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-mono" title={r.id}>
                {shortId(r.id)}
              </span>
              <span className="text-ink-2">{r.kind}</span>
              <span className="text-ink-3">
                {t("attempts", { n: r.attempts })}
              </span>
              {r.when !== null && <Age seconds={r.when} />}
              {r.finished && (
                <span className="text-ink-3">
                  {new Date(r.finished).toLocaleString()}
                </span>
              )}
            </div>
            {r.error && (
              <p className="mt-0.5 font-mono text-[12px] wrap-anywhere text-ink-3">
                {r.error}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Memory({ c }: { c: Container }) {
  const { share, level } = memoryLevel(c);
  return (
    <div className="min-w-28">
      <p className="font-mono text-[12px] tabular-nums">
        {mib(c.memory_used_mib)} / {mib(c.memory_limit_mib)}
      </p>
      {share !== null && (
        <div className="mt-1 h-1.5 rounded-full bg-surface-2">
          <div
            className={cn(
              "h-1.5 rounded-full",
              level === "critical"
                ? "bg-danger"
                : level === "high"
                  ? "bg-warn"
                  : "bg-ink-2"
            )}
            style={{ width: `${Math.min(100, Math.max(2, share * 100))}%` }}
          />
        </div>
      )}
    </div>
  );
}

function PodsBody({
  p,
  age,
  onLogs,
}: {
  p: PodsPayload;
  age: number;
  onLogs: (target: LogTarget) => void;
}) {
  const t = useTranslations("console.health.pods");
  return (
    <>
      <div className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-4">
        <Figure label={t("namespace")} value={p.namespace} />
        <Figure
          label={t("restarted24h")}
          value={p.restarted_24h}
          alert={p.restarted_24h > 0}
        />
        <Figure label={t("oom24h")} value={p.oom_24h} alert={p.oom_24h > 0} />
        <Figure label={t("restartsTotal")} value={p.restarts_total} />
      </div>
      {!p.metrics && (
        <p className="px-5 pb-3 text-[13px] text-ink-3">{t("noMetrics")}</p>
      )}
      <div className="overflow-x-auto px-5 pb-4">
        <table className="w-full text-[14px]">
          <thead className="text-left text-[12px] text-ink-3">
            <tr>
              <th className="pb-2 font-medium">{t("pod")}</th>
              <th className="pb-2 font-medium">{t("state")}</th>
              <th className="pr-3 pb-2 text-right font-medium">
                {t("restarts")}
              </th>
              <th className="pb-2 font-medium">{t("last")}</th>
              <th className="pb-2 font-medium">{t("memory")}</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {sortPods(p.pods).flatMap((pod) =>
              pod.containers.map((c) => (
                <tr
                  key={`${pod.name}/${c.name}`}
                  className="border-t border-hairline align-top"
                >
                  <td className="py-2 pr-3">
                    <p className="font-mono text-[13px]">{pod.name}</p>
                    {pod.containers.length > 1 && (
                      <p className="text-[12px] text-ink-3">{c.name}</p>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={cn(
                        "text-[13px]",
                        c.state === "running" && c.ready
                          ? "text-ink-2"
                          : "text-danger"
                      )}
                    >
                      {c.reason ?? c.state}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {c.restarts}
                  </td>
                  <td className="py-2 pr-3 text-[13px]">
                    {c.last ? (
                      <>
                        <span
                          className={cn(
                            c.last.reason === "OOMKilled" &&
                              "font-semibold text-danger"
                          )}
                        >
                          {c.last.reason ?? "–"}
                        </span>
                        <span className="text-ink-3">
                          {" "}
                          · {t("exit", { code: c.last.exit_code ?? "–" })}{" "}
                          ·{" "}
                        </span>
                        <Ago seconds={since(c.last.ago_s, age)} />
                      </>
                    ) : (
                      <span className="text-ink-3">–</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <Memory c={c} />
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="pressable text-[13px] text-accent"
                      onClick={() =>
                        onLogs({
                          pod: pod.name,
                          container: c.name,
                          previous: false,
                        })
                      }
                    >
                      {t("logs")}
                    </button>
                    {(c.restarts > 0 || c.last) && (
                      <button
                        type="button"
                        className="pressable ml-3 text-[13px] text-accent"
                        onClick={() =>
                          onLogs({
                            pod: pod.name,
                            container: c.name,
                            previous: true,
                          })
                        }
                      >
                        {t("previousLogs")}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {p.events.length > 0 && (
        <div className="border-t border-hairline px-5 py-3">
          <h3 className="mb-2 text-[13px] font-semibold text-ink-2">
            {t("events")}
          </h3>
          <ul className="grid gap-1.5">
            {p.events.map((e, i) => (
              <li key={i} className="text-[13px]">
                <span
                  className={cn(
                    e.type === "Warning" ? "text-danger" : "text-ink-2"
                  )}
                >
                  {e.reason}
                </span>
                <span className="font-mono text-ink-3"> {e.object}</span>
                {e.count > 1 && <span className="text-ink-3"> ×{e.count}</span>}
                <span className="text-ink-3"> · </span>
                <Ago seconds={since(e.ago_s, age)} />
                <p className="text-ink-3 wrap-anywhere">{e.message}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Definitions
        items={[
          t("def.restarts"),
          t("def.last"),
          t("def.restarted"),
          t("def.memory"),
          t("def.events"),
        ]}
      />
    </>
  );
}

const TAILS = [100, 200, 500, 1000, 2000];

/** One container's log, read when asked, never kept: each read is in the console's audit. */
function Logs({
  chosen,
  onChoose,
}: {
  chosen: LogTarget | null;
  onChoose: (target: LogTarget) => void;
}) {
  const t = useTranslations("console.health.logs");
  const errorText = useErrorText();
  // The pods panel's snapshot, from the same cache: choosing a container costs no read.
  const pods = useSnapshot("health.pods");
  const targets = logTargets(
    (pods.data?.payload as PodsPayload | undefined)?.pods ?? []
  );
  const [tail, setTail] = useState(200);
  const [q, setQ] = useState("");
  const read = useMutation({
    mutationFn: (target: LogTarget) =>
      ops.get<LogOut>(
        `health/logs${query({
          pod: target.pod,
          container: target.container,
          previous: target.previous ? "true" : null,
          tail,
          q: q.trim() || null,
        })}`
      ),
  });
  const key = (x: LogTarget) => `${x.pod}/${x.container}`;
  return (
    <Card inset>
      <div className="border-b border-hairline px-5 py-3">
        <h2 className="type-heading">{t("title")}</h2>
        <p className="mt-1 text-[13px] text-ink-3">{t("intro")}</p>
      </div>
      <form
        className="grid gap-3 px-5 py-4 sm:grid-cols-[2fr_auto_auto_2fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (chosen) read.mutate(chosen);
        }}
      >
        <Field label={t("container")}>
          <Select
            value={chosen ? key(chosen) : ""}
            onChange={(e) => {
              const found = targets.find((x) => key(x) === e.target.value);
              if (found)
                onChoose({ ...found, previous: chosen?.previous ?? false });
            }}
          >
            <option value="" disabled>
              {targets.length ? t("choose") : t("refreshPods")}
            </option>
            {targets.map((x) => (
              <option key={key(x)} value={key(x)}>
                {key(x)}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 pb-2 text-[14px]">
          <input
            type="checkbox"
            checked={chosen?.previous ?? false}
            disabled={!chosen}
            onChange={(e) =>
              chosen && onChoose({ ...chosen, previous: e.target.checked })
            }
          />
          {t("previous")}
        </label>
        <Field label={t("tail")}>
          <Select
            value={tail}
            onChange={(e) => setTail(Number(e.target.value))}
          >
            {TAILS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("filter")}>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={200}
          />
        </Field>
        <Button type="submit" size="sm" disabled={!chosen || read.isPending}>
          {t("read")}
        </Button>
      </form>
      {read.isError && (
        <div className="px-5 pb-4">
          <ErrorBanner message={errorText(read.error)} />
        </div>
      )}
      {read.data && (
        <div className="border-t border-hairline px-5 py-3">
          <p className="mb-2 text-[12px] text-ink-3">
            {t("shown", {
              lines: read.data.lines.length,
              read: read.data.read,
            })}
            {read.data.older_cut && ` · ${t("olderCut")}`}
          </p>
          <pre className="max-h-[32rem] overflow-auto rounded-md bg-surface-2 p-3 font-mono text-[12px] leading-5 wrap-anywhere whitespace-pre-wrap">
            {read.data.lines.join("\n") || t("empty")}
          </pre>
        </div>
      )}
    </Card>
  );
}

/**
 * Health: the job queue, the pods and their logs - what used to need `kubectl`. Every
 * panel is a snapshot refreshed on a click; logs are read on demand and never stored.
 */
export function HealthApp({ semver }: AppPageProps) {
  const t = useTranslations("console.health");
  const [chosen, setChosen] = useState<LogTarget | null>(null);
  return (
    <div
      data-version={semver}
      className="grid max-w-5xl min-w-0 gap-6 [&>*]:min-w-0"
    >
      <p className="text-ink-2">{t("intro")}</p>
      <SnapshotPanel<JobsPayload>
        panelKey="health.jobs"
        title={t("jobs.title")}
      >
        {(p, age) => <JobsBody p={p} age={age} />}
      </SnapshotPanel>
      <SnapshotPanel<PodsPayload>
        panelKey="health.pods"
        title={t("pods.title")}
      >
        {(p, age) => (
          <PodsBody
            p={p}
            age={age}
            onLogs={(target) => {
              setChosen(target);
              document
                .getElementById("health-logs")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          />
        )}
      </SnapshotPanel>
      <div id="health-logs">
        <Logs chosen={chosen} onChoose={setChosen} />
      </div>
    </div>
  );
}
