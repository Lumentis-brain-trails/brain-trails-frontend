"use client";

/**
 * A patient at a glance (backend T6): eight weeks of sessions on one axis, how much of
 * what was assigned got done, what changed since the last session in words, each named
 * measure as a small line, the sessions with their notes, the person's landscape with
 * every trail, and what the patient may see of it all.
 *
 * Plain words first and numbers second: a change is "lower (better)", not a delta; the
 * number is beside it for whoever wants it. Which measures exist is the backend's
 * registry (QUESTIONS C1); a session shows the ones its blocks have.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { LandscapeSurface } from "@/components/compare/LandscapeSurface";
import {
  Card,
  ErrorBanner,
  Segmented,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import { useFormatLocale } from "@/i18n/formatLocale";
import { useErrorMessage } from "@/lib/errorMessage";
import { useChartTheme, trailHexAt } from "@/lib/theme";
import {
  SHARE_LEVELS,
  type ShareLevel,
  type Timeline,
  formatMeasure,
  useShare,
  useSubjectLandscape,
  useTimeline,
} from "@/lib/therapy";

const VERDICT_TONE: Record<string, string> = {
  good: "bg-ok",
  usable: "bg-warn",
  poor: "bg-danger",
};

export function PatientTimeline({
  subjectId,
  share,
  canShare,
  hasAccount,
}: {
  subjectId: string;
  share: string | null | undefined;
  canShare: boolean;
  hasAccount: boolean;
}) {
  const t = useTranslations("therapy");
  const errorMessage = useErrorMessage();
  const timeline = useTimeline(subjectId);

  return (
    <section aria-label={t("timeline.title")} className="space-y-6">
      <SectionTitle>{t("timeline.title")}</SectionTitle>
      {timeline.isLoading && <Skeleton className="h-64" />}
      {timeline.isError && (
        <ErrorBanner message={errorMessage(timeline.error)} />
      )}
      {timeline.data && <TimelineBody data={timeline.data} />}
      <PatientLandscape subjectId={subjectId} />
      {canShare && (
        <ShareControl
          subjectId={subjectId}
          level={(share ?? "nothing") as ShareLevel}
          hasAccount={hasAccount}
        />
      )}
    </section>
  );
}

function TimelineBody({ data }: { data: Timeline }) {
  const t = useTranslations("therapy");
  const locale = useFormatLocale();
  const since = +new Date(data.since);
  const span = Math.max(1, +new Date(data.until) - since);
  const at = (iso: string) => ((+new Date(iso) - since) / span) * 100;
  const label = (family: string, metric: string) =>
    `${t(`families.${family as "session"}`)} · ${t(`metrics.${metric as "d_prime"}`)}`;
  const late = data.assignments.filter((a) => a.late).length;
  const sessions = [...data.sessions].reverse();

  return (
    <>
      <Card className="space-y-4">
        <p className="text-ink">
          {data.adherence.assigned > 0
            ? t("timeline.adherence", {
                done: data.adherence.done,
                assigned: data.adherence.assigned,
                pct: Math.round((data.adherence.share ?? 0) * 100),
              })
            : t("timeline.adherenceNone")}
          {late > 0 && (
            <span className="ml-2 text-ink-3">
              {t("timeline.late", { n: late })}
            </span>
          )}
        </p>
        <div
          role="img"
          aria-label={t("timeline.axisAria", {
            n: data.sessions.length,
            weeks: data.weeks,
          })}
          className="relative h-10 rounded-full bg-surface-2"
        >
          {Array.from({ length: data.weeks - 1 }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className="absolute top-2 bottom-2 w-px bg-hairline"
              style={{ left: `${((i + 1) / data.weeks) * 100}%` }}
            />
          ))}
          {data.sessions.map((s) => (
            <span
              key={s.id}
              title={`${new Date(s.started_at).toLocaleDateString(locale)} · ${s.title}`}
              className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                VERDICT_TONE[s.verdict ?? ""] ?? "bg-ink-3"
              }`}
              style={{ left: `${at(s.started_at)}%` }}
            />
          ))}
        </div>
        <p className="type-caption flex justify-between text-ink-3">
          <span>{new Date(data.since).toLocaleDateString(locale)}</span>
          <span>{t("timeline.today")}</span>
        </p>
      </Card>

      <Card>
        <h3 className="type-subhead mb-3">{t("changes.title")}</h3>
        {data.changes.length === 0 ? (
          <p className="text-[14px] text-ink-3">{t("changes.none")}</p>
        ) : (
          <ul className="space-y-1.5 text-[14px]">
            {data.changes.map((c) => (
              <li key={c.key}>
                <span className="font-medium">{label(c.family, c.metric)}</span>
                {": "}
                {t(`changes.${c.direction as "up"}`)}
                {c.reading && (
                  <span
                    className={c.reading === "better" ? "text-ok" : "text-warn"}
                  >
                    {" "}
                    ({t(`changes.${c.reading as "better"}`)})
                  </span>
                )}
                <span className="text-ink-3">
                  {" · "}
                  {formatMeasure(c.metric, c.previous)} →{" "}
                  {formatMeasure(c.metric, c.last)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data.measures.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.measures.map((m) => {
            const values = m.points.map((p) => p.value);
            const last = values.at(-1);
            return (
              <Card key={m.key} className="space-y-2">
                <p className="type-caption text-ink-3">
                  {label(m.family, m.metric)}
                </p>
                <p className="type-heading tabular-nums">
                  {last === undefined ? "—" : formatMeasure(m.metric, last)}
                </p>
                <Sparkline
                  values={values}
                  xs={m.points.map((p) => at(p.at))}
                  label={label(m.family, m.metric)}
                />
              </Card>
            );
          })}
        </div>
      )}

      <Card inset>
        <h3 className="type-subhead px-5 pt-4 pb-2">
          {t("timeline.sessionsTitle")}
        </h3>
        {sessions.length === 0 && (
          <p className="px-5 pb-4 text-ink-3">{t("timeline.none")}</p>
        )}
        {sessions.map((s) => (
          <Link
            key={s.id}
            href={`/recordings/${s.recording_id}`}
            className="pressable flex items-center gap-3 border-t border-hairline px-5 py-3 hover:bg-surface-2"
          >
            <span
              aria-hidden
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                VERDICT_TONE[s.verdict ?? ""] ?? "bg-ink-3"
              }`}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{s.title}</span>
              <span className="block text-[13px] text-ink-3">
                {[
                  new Date(s.started_at).toLocaleDateString(locale),
                  t(`verdict.${(s.verdict ?? "unknown") as "good"}`),
                  s.minutes !== null && t("timeline.minutes", { n: s.minutes }),
                  s.notes > 0 && t("timeline.notes", { n: s.notes }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            {!s.opened && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-medium text-accent">
                {t("timeline.new")}
              </span>
            )}
          </Link>
        ))}
      </Card>
    </>
  );
}

/** One measure over the weeks, on the same time axis as the sessions. */
function Sparkline({
  values,
  xs,
  label,
}: {
  values: number[];
  xs: number[];
  label: string;
}) {
  if (values.length < 2)
    return <div aria-hidden className="h-10 rounded bg-surface-2" />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const y = (v: number) => (hi === lo ? 50 : 90 - ((v - lo) / (hi - lo)) * 80);
  const points = values.map((v, i) => `${xs[i]},${y(v)}`).join(" ");
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-10 w-full"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
        className="text-accent"
      />
    </svg>
  );
}

function PatientLandscape({ subjectId }: { subjectId: string }) {
  const t = useTranslations("therapy.landscape");
  const theme = useChartTheme();
  const landscape = useSubjectLandscape(subjectId);
  if (landscape.isLoading) return <Skeleton className="h-80" />;
  if (!landscape.data)
    return (
      <Card>
        <h3 className="type-subhead mb-1">{t("title")}</h3>
        <p className="text-[14px] text-ink-3">{t("notReady")}</p>
      </Card>
    );
  const trails = Object.values(landscape.data.trails ?? {});
  return (
    <Card className="p-2 sm:p-4">
      <h3 className="type-subhead mb-1 px-2">{t("title")}</h3>
      <p className="mb-3 px-2 text-[14px] text-ink-2">
        {t("intro", { n: trails.length })}
      </p>
      <LandscapeSurface
        landscape={landscape.data}
        height={420}
        title={t("aria")}
        trails={trails.map((trail, i) => ({
          x: trail.x,
          y: trail.y,
          colors: trail.x.map(() =>
            trailHexAt(
              theme.trail,
              trails.length > 1 ? i / (trails.length - 1) : 1
            )
          ),
          // the most recent session stands out; the others are its context
          faint: i < trails.length - 1,
        }))}
      />
    </Card>
  );
}

function ShareControl({
  subjectId,
  level,
  hasAccount,
}: {
  subjectId: string;
  level: ShareLevel;
  hasAccount: boolean;
}) {
  const t = useTranslations("therapy.share");
  const errorMessage = useErrorMessage();
  const share = useShare(subjectId);
  const current =
    (share.data?.share_results as ShareLevel | undefined) ?? level;
  return (
    <Card className="space-y-3">
      <h3 className="type-subhead">{t("title")}</h3>
      <p className="text-[14px] text-ink-2">{t("intro")}</p>
      <Segmented
        label={t("title")}
        value={current}
        onChange={(v) => share.mutate(v)}
        options={SHARE_LEVELS.map((l) => ({ value: l, label: t(l) }))}
      />
      <p className="text-[14px] text-ink-3">{t(`${current}Hint`)}</p>
      {!hasAccount && (
        <p className="text-[14px] text-ink-3">{t("noAccount")}</p>
      )}
      {share.isError && <ErrorBanner message={errorMessage(share.error)} />}
    </Card>
  );
}
