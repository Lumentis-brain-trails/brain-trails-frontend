"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import {
  Button,
  Card,
  ErrorBanner,
  Icon,
  KeyValue,
  Skeleton,
  Spinner,
} from "@/components/ui";
import { useOps, useOpsEnv } from "@console/components/env";
import { useErrorText } from "@console/components/useErrorText";
import {
  type LabExperiment,
  type LabMetric,
  type LabResult,
  type LabRun,
  OpsRequestError,
} from "@console/lib/client";
import {
  auc,
  colourFor,
  fewPeople,
  metric,
  pollInterval,
  runError,
  runErrorCode,
} from "../lib/lab";
import { GraphView, Legend, Scatter } from "./charts";
import { StatusBadge } from "./RunList";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="grid gap-4">
      <h3 className="type-heading">{title}</h3>
      {children}
    </Card>
  );
}

/** What the run read: how much, from when, and what it left out and why. */
function Summary({ result }: { result: LabResult }) {
  const t = useTranslations("console.pipelineLab.summary");
  const format = useFormatter();
  const s = result.summary;
  const day = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium" }) : "–";
  const skipped = Object.entries(s.skipped).filter(([, n]) => n > 0);
  const known = [
    "other_embedder",
    "no_windows",
    "no_labelled_windows",
    "window_cap",
    "person_cap",
    "unreadable",
  ] as const;
  const reason = (key: string) =>
    (known as readonly string[]).includes(key)
      ? t(`skip.${key as (typeof known)[number]}`)
      : key;
  return (
    <Section title={t("title")}>
      <div className="grid gap-x-8 sm:grid-cols-2">
        <KeyValue label={t("recordings")} value={s.n_recordings} />
        <KeyValue label={t("people")} value={s.n_people} />
        <KeyValue label={t("windows")} value={s.n_windows} />
        <KeyValue label={t("embedder")} value={s.embedder ?? "–"} mono />
        <KeyValue
          label={t("dims")}
          value={t("dimsValue", { dim: s.dim, reduced: s.reduced_dim })}
        />
        <KeyValue
          label={t("dates")}
          value={`${day(s.date_first)} – ${day(s.date_last)}`}
        />
        <KeyValue label={t("fingerprint")} value={s.data_fingerprint} mono />
        {skipped.length > 0 && (
          <KeyValue
            label={t("skipped")}
            value={skipped
              .map(([key, n]) => t("skipLine", { reason: reason(key), n }))
              .join(", ")}
          />
        )}
      </div>
      {s.labels.length > 0 && (
        <div className="grid gap-2">
          <h4 className="text-[13px] font-semibold text-ink-2">
            {t("labels")}
          </h4>
          <ul className="grid gap-1 text-[14px]">
            {s.labels.map((l) => (
              <li key={l.label} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{
                    background: colourFor(result.points.labels, l.label),
                  }}
                />
                <span className="font-medium">{l.label}</span>
                <span className="text-ink-3">
                  {t("labelLine", { windows: l.windows, people: l.people })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

/** A against B: the AUC on the embeddings and on the 2-D view, with its people. */
function Classifier({
  classifier,
  a,
  b,
}: {
  classifier: NonNullable<LabResult["classifier"]>;
  a: string;
  b: string;
}) {
  const t = useTranslations("console.pipelineLab.classifier");
  const scores = [
    { key: "onEmbeddings" as const, score: classifier.embeddings },
    { key: "onView" as const, score: classifier.reduction },
  ];
  return (
    <Section title={`${t("title")}: ${a} / ${b}`}>
      <p className="text-[14px] text-ink-2">
        {t("people", {
          n: classifier.n_people,
          a: classifier.n_people_a,
          b: classifier.n_people_b,
          windows: classifier.n_windows,
        })}
      </p>
      {fewPeople(classifier) && (
        <p
          role="note"
          className="rounded-[var(--radius-control)] bg-warn-soft px-4 py-3 text-[14px] text-warn"
        >
          {t("fewPeople")}
        </p>
      )}
      {classifier.status !== "done" ? (
        <p className="text-[14px] text-ink-2">
          {classifier.warnings?.includes("sample_one_person")
            ? t("sampleOnePerson")
            : t(classifier.status)}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {scores.map(({ key, score }) => (
            <div
              key={key}
              className="rounded-[var(--radius-control)] bg-surface-2 px-4 py-3"
            >
              <div className="text-[13px] text-ink-2">
                {t(key)} · {t("auc")}
              </div>
              <div className="font-mono text-[24px] tabular-nums">
                {auc(score?.auc_mean)}
                {score?.auc_sd !== null && score?.auc_sd !== undefined && (
                  <span className="text-[15px] text-ink-3">
                    {" "}
                    ± {auc(score.auc_sd)}
                  </span>
                )}
              </div>
              <div className="text-[12px] text-ink-3">
                {t("folds", { n: score?.folds.length ?? 0 })}
              </div>
              {score?.transductive && (
                <div className="mt-1 text-[12px] text-ink-3">
                  {t("transductive")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/** The per-person rows: one with all a person's windows, then one per label. */
function MetricsTable({ result }: { result: LabResult }) {
  const t = useTranslations("console.pipelineLab.table");
  const tm = useTranslations("console.pipelineLab.metrics");
  const metrics = result.metrics;
  if (result.table.length === 0)
    return (
      <Section title={t("title")}>
        <p className="text-[14px] text-ink-2">{t("empty")}</p>
      </Section>
    );
  return (
    <Section title={t("title")}>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-surface text-left text-[12px] text-ink-3">
            <tr>
              <th className="pb-2 font-medium">{t("person")}</th>
              <th className="pb-2 font-medium">{t("label")}</th>
              <th className="pb-2 text-right font-medium">{t("windows")}</th>
              <th className="pb-2 text-right font-medium">{t("regions")}</th>
              {metrics.map((m) => (
                <th key={m} className="pb-2 text-right font-medium">
                  {tm(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.table.map((row, i) => (
              <tr key={i} className="border-t border-hairline">
                <td className="py-1.5 pr-3 font-mono">
                  {row.person.slice(0, 8)}
                </td>
                <td className="py-1.5 pr-3">{row.label ?? t("all")}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {row.n_windows}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {row.n_regions}
                </td>
                {metrics.map((m) => (
                  <td key={m} className="py-1.5 text-right tabular-nums">
                    {metric(row[m as LabMetric])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/** Each label across people: mean ± sd, every person counted once. */
function ByLabel({ result }: { result: LabResult }) {
  const t = useTranslations("console.pipelineLab.byLabel");
  const tt = useTranslations("console.pipelineLab.table");
  const tm = useTranslations("console.pipelineLab.metrics");
  if (result.by_label.length === 0) return null;
  return (
    <Section title={t("title")}>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-left text-[12px] text-ink-3">
            <tr>
              <th className="pb-2 font-medium">{tt("label")}</th>
              <th className="pb-2 text-right font-medium">{t("people")}</th>
              <th className="pb-2 text-right font-medium">{tt("windows")}</th>
              {result.metrics.map((m) => (
                <th key={m} className="pb-2 text-right font-medium">
                  {tm(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.by_label.map((row, i) => (
              <tr key={i} className="border-t border-hairline">
                <td className="py-1.5 pr-3">{row.label ?? tt("all")}</td>
                <td className="py-1.5 text-right tabular-nums">{row.people}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {row.windows}
                </td>
                {result.metrics.map((m) => {
                  const v = row.metrics[m];
                  return (
                    <td key={m} className="py-1.5 text-right tabular-nums">
                      {v?.mean === null || v?.mean === undefined
                        ? "–"
                        : v.sd === null
                          ? metric(v.mean)
                          : t("meanSd", {
                              mean: metric(v.mean),
                              sd: metric(v.sd),
                            })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/** The result of a done run, top to bottom: data, A/B, map, graph, tables. */
export function ResultView({
  result,
  config,
}: {
  result: LabResult;
  config: LabExperiment;
}) {
  const t = useTranslations("console.pipelineLab");
  const tr = useTranslations("console.pipelineLab.reduction");
  const g = result.graph;
  const labels = result.points.labels;
  const seconds = Object.values(result.timing).reduce((a, b) => a + b, 0);
  const q = config.question;
  return (
    <div className="grid gap-4">
      <Summary result={result} />
      {result.classifier && q?.a && q?.b && (
        <Classifier classifier={result.classifier} a={q.a} b={q.b} />
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t("map.title", { method: tr(result.points.method) })}>
          <Scatter points={result.points} />
          {labels.length > 0 ? (
            <Legend labels={labels} />
          ) : (
            <p className="text-[13px] text-ink-3">{t("map.oneColour")}</p>
          )}
          <p className="text-[13px] text-ink-3">
            {t("map.sample", {
              shown: result.points.x.length,
              total: result.points.n_total,
            })}
          </p>
        </Section>
        <Section title={t("graphView.title")}>
          <GraphView graph={g} labels={labels} />
          <p className="text-[13px] text-ink-3">
            {t("graphView.line", {
              eps: metric(g.epsilon),
              how: g.auto ? t("graphView.auto") : t("graphView.manual"),
              nodes: g.n_nodes,
              edges: g.n_edges,
              components: g.n_components,
              betti: g.betti1,
            })}
          </p>
        </Section>
      </div>
      <ByLabel result={result} />
      <MetricsTable result={result} />
      <p className="text-[13px] text-ink-3">
        {t("run.took", { seconds: seconds.toFixed(1) })}
      </p>
    </div>
  );
}

/** Whether bt-ops refused the run because it belongs to another environment. */
function isEnvMismatch(error: unknown): boolean {
  return error instanceof OpsRequestError && error.code === "env_mismatch";
}

/**
 * One run: its status while bt-ops works on it (read again every 3 s, and no more once
 * it is done or failed, or once a read failed), then its result or what stopped it. A
 * failed read shows its banner above what was last read. A run belongs to the
 * environment it read: under another one nothing of it is shown (bt-ops answers 422
 * `env_mismatch`). "Run again" runs the same experiment on today's data; "Edit a copy"
 * brings it back into the form.
 */
export function RunView({
  runId,
  onBack,
  onOpen,
  onCopy,
}: {
  runId: string;
  onBack: () => void;
  onOpen: (id: string) => void;
  onCopy: (config: LabExperiment) => void;
}) {
  const t = useTranslations("console.pipelineLab");
  const tEnv = useTranslations("console.env");
  const format = useFormatter();
  const errorText = useErrorText();
  const envOps = useOps();
  const { env, cacheKey } = useOpsEnv();
  const queryClient = useQueryClient();
  const run = useQuery({
    queryKey: ["lab-run", cacheKey, runId],
    queryFn: () => envOps.get<LabRun>(`lab/runs/${runId}`),
    refetchInterval: (query) =>
      pollInterval(query.state.data?.status, query.state.status === "error"),
  });
  const rerun = useMutation({
    mutationFn: () => envOps.post<LabRun>(`lab/runs/${runId}/rerun`),
    onSuccess: async (next) => {
      await queryClient.invalidateQueries({ queryKey: ["lab-runs"] });
      onOpen(next.id);
    },
  });

  const back = (
    <div>
      <Button variant="ghost" size="sm" onClick={onBack}>
        <Icon name="back" className="mr-1.5" />
        {t("run.back")}
      </Button>
    </div>
  );
  if (run.isPending) return <Skeleton className="h-64" />;
  const r = run.data;
  const mismatch =
    isEnvMismatch(run.error) ||
    (r !== undefined && env !== null && r.env !== env);
  if (mismatch || r === undefined)
    return (
      <div className="grid gap-4">
        {back}
        <ErrorBanner
          message={mismatch ? t("run.envMismatch") : errorText(run.error)}
        />
      </div>
    );
  const failure = runError(r.error);
  return (
    <div className="grid gap-4">
      {back}
      {run.isError && <ErrorBanner message={errorText(run.error)} />}
      <Card className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="type-heading min-w-0 flex-1 truncate">{r.title}</h2>
          <StatusBadge status={r.status} />
        </div>
        <p className="text-[13px] text-ink-3">
          {tEnv(`name.${r.env}`)} ·{" "}
          {t("list.line", {
            when: format.relativeTime(new Date(r.created_at)),
            who: r.created_by ?? t("list.someone"),
          })}{" "}
          · {t("run.config", { hash: r.config_hash.slice(0, 12) })}
        </p>
        {(r.status === "queued" || r.status === "running") && (
          <p className="flex items-center gap-2 text-[14px] text-ink-2">
            <Spinner />
            {t(`run.${r.status}`)}
          </p>
        )}
        {failure && (
          <div className="grid gap-1">
            <ErrorBanner
              message={t(`run.errors.${runErrorCode(failure.code)}`)}
            />
            {failure.message && (
              <p className="font-mono text-[12px] text-ink-3">
                {t("run.detail", { message: failure.message })}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={rerun.isPending}
            onClick={() => rerun.mutate()}
          >
            {t("run.rerun")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onCopy(r.config)}>
            {t("run.copy")}
          </Button>
        </div>
        {rerun.isError && <ErrorBanner message={errorText(rerun.error)} />}
      </Card>
      {r.status === "done" && r.result && (
        <ResultView result={r.result} config={r.config} />
      )}
    </div>
  );
}
