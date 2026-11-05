"use client";

import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Card, ErrorBanner, Skeleton, cn } from "@/components/ui";
import { useErrorText } from "@console/components/useErrorText";
import { ops } from "@console/lib/client";
import type { AppPageProps } from "@console/lib/manifest";
import {
  type Item,
  type Milestone,
  type Roadmap,
  type Status,
  STATUSES,
  addDays,
  daysBetween,
  dependencies,
  isLate,
  monthStarts,
  rowsByTrack,
  spanOf,
  weekStarts,
} from "./lib/gantt";

const LABEL_W = 232;
const PX_PER_DAY = 13;
const ROW_H = 30;
const TRACK_H = 34;
const HEAD_H = 40;
const BAR_H = 16;

/** The bar's look for a status: fill and stroke classes of the product's tokens. */
const BAR: Record<Status, string> = {
  done: "fill-ok",
  in_progress: "fill-ink",
  review: "fill-warn",
  planned: "fill-ink-3",
  proposed: "fill-surface stroke-ink-3",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function StatusBadge({ status, late }: { status: Status; late: boolean }) {
  const t = useTranslations("console.roadmap.status");
  return (
    <span
      className={cn(
        "rounded-md px-2 py-0.5 text-[12px] font-semibold",
        status === "done" && "bg-ok-soft text-ok",
        status === "review" && "bg-warn-soft text-warn",
        (status === "in_progress" || status === "planned") &&
          "bg-accent-soft text-ink",
        status === "proposed" && "border border-hairline-strong text-ink-3",
        late && "bg-danger-soft text-danger"
      )}
    >
      {t(status)}
      {late && ` · ${t("late")}`}
    </span>
  );
}

/** The chart: one row per item under its track, weeks as columns, today as a line. */
function Gantt({
  roadmap,
  today,
  selected,
  onSelect,
}: {
  roadmap: Roadmap;
  today: string;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("console.roadmap");
  const format = useFormatter();
  const span = spanOf(roadmap, today);
  const x = (day: string) =>
    LABEL_W + daysBetween(span.start, day) * PX_PER_DAY;
  const width = x(span.end) + PX_PER_DAY;
  const rows = rowsByTrack(roadmap);
  const milestones = roadmap.milestones ?? [];

  // Lay the rows out: a track header, then one row per item.
  let y = HEAD_H;
  const trackY = new Map<string, number>();
  const itemY = new Map<string, number>();
  for (const row of rows) {
    trackY.set(row.track.id, y);
    y += TRACK_H;
    for (const item of row.items) {
      itemY.set(item.id, y);
      y += ROW_H;
    }
  }
  const height = y + 8;
  const monthLabel = (day: string) =>
    format.dateTime(new Date(`${day}T12:00:00Z`), {
      month: "long",
      year: "numeric",
    });
  const dayLabel = (day: string) =>
    format.dateTime(new Date(`${day}T12:00:00Z`), {
      day: "numeric",
      month: "short",
    });

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-hairline bg-surface">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={t("chartLabel")}
        className="block text-[12px]"
      >
        {/* week columns */}
        {weekStarts(span.start, span.end).map((week, i) => (
          <g key={week}>
            {i % 2 === 1 && (
              <rect
                x={x(week)}
                y={HEAD_H}
                width={PX_PER_DAY * 7}
                height={height - HEAD_H}
                className="fill-surface-2"
                opacity={0.6}
              />
            )}
            <text
              x={x(week) + 3}
              y={HEAD_H - 8}
              className="fill-ink-3"
              fontSize={11}
            >
              {dayLabel(week)}
            </text>
          </g>
        ))}
        {/* month starts */}
        {[span.start, ...monthStarts(span.start, span.end)].map((m, i) => (
          <g key={m}>
            {i > 0 && (
              <line
                x1={x(m)}
                x2={x(m)}
                y1={0}
                y2={height}
                className="stroke-hairline-strong"
              />
            )}
            <text
              x={x(m) + 4}
              y={14}
              className="fill-ink-2"
              fontSize={12}
              fontWeight={600}
            >
              {monthLabel(i === 0 ? addDays(m, 3) : m)}
            </text>
          </g>
        ))}
        {/* rows */}
        {rows.map((row) => {
          const ty = trackY.get(row.track.id) ?? 0;
          return (
            <g key={row.track.id}>
              <rect
                x={0}
                y={ty}
                width={width}
                height={TRACK_H}
                className="fill-surface-3"
                opacity={0.8}
              />
              <text
                x={12}
                y={ty + TRACK_H / 2 + 4}
                className="fill-ink"
                fontSize={12}
                fontWeight={700}
              >
                {row.track.name}
              </text>
              {row.items.map((item) => {
                const iy = itemY.get(item.id) ?? 0;
                const x1 = x(item.start);
                const w = Math.max(
                  PX_PER_DAY,
                  (daysBetween(item.start, item.end) + 1) * PX_PER_DAY
                );
                const late = isLate(item, today);
                const active = item.id === selected;
                return (
                  <g
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${item.label} ${item.name}`}
                    className="cursor-pointer outline-none"
                    onClick={() => onSelect(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(item.id);
                      }
                    }}
                  >
                    {active && (
                      <rect
                        x={0}
                        y={iy}
                        width={width}
                        height={ROW_H}
                        className="fill-accent-soft"
                      />
                    )}
                    <text
                      x={12}
                      y={iy + ROW_H / 2 + 4}
                      className="fill-ink-3"
                      fontSize={11}
                      fontFamily="var(--font-mono, monospace)"
                    >
                      {item.label}
                    </text>
                    <text
                      x={52}
                      y={iy + ROW_H / 2 + 4}
                      className={cn("fill-ink", active && "font-semibold")}
                      fontSize={12}
                    >
                      {item.name.length > 30
                        ? `${item.name.slice(0, 29)}…`
                        : item.name}
                    </text>
                    <rect
                      x={x1}
                      y={iy + (ROW_H - BAR_H) / 2}
                      width={w}
                      height={BAR_H}
                      rx={4}
                      strokeWidth={item.status === "proposed" ? 1.2 : 0}
                      strokeDasharray={item.tentative ? "4 3" : undefined}
                      className={cn(
                        BAR[item.status],
                        item.tentative &&
                          item.status !== "proposed" &&
                          "stroke-ink",
                        late && "stroke-danger"
                      )}
                      opacity={item.status === "planned" ? 0.55 : 1}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
        {/* milestones */}
        {milestones.map((m) => {
          const my = (trackY.get(m.track) ?? 0) + TRACK_H / 2;
          const mx = x(m.date) + PX_PER_DAY / 2;
          return (
            <g key={m.id} aria-label={m.name}>
              <polygon
                points={`${mx},${my - 7} ${mx + 7},${my} ${mx},${my + 7} ${mx - 7},${my}`}
                className={m.status === "done" ? "fill-ok" : "fill-ink"}
              />
              <title>{`${dayLabel(m.date)} · ${m.name}`}</title>
            </g>
          );
        })}
        {/* today */}
        <line
          x1={x(today) + PX_PER_DAY / 2}
          x2={x(today) + PX_PER_DAY / 2}
          y1={HEAD_H - 4}
          y2={height}
          className="stroke-danger"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
        <text
          x={x(today) + PX_PER_DAY / 2 + 4}
          y={HEAD_H + 12}
          className="fill-danger"
          fontSize={11}
        >
          {t("today")}
        </text>
      </svg>
    </div>
  );
}

function Legend() {
  const t = useTranslations("console.roadmap");
  const ts = useTranslations("console.roadmap.status");
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
      {STATUSES.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <svg width="18" height="10" aria-hidden>
            <rect
              width="18"
              height="10"
              rx="3"
              className={BAR[s]}
              strokeWidth={s === "proposed" ? 1.2 : 0}
              opacity={s === "planned" ? 0.55 : 1}
            />
          </svg>
          {ts(s)}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <svg width="18" height="10" aria-hidden>
          <rect
            width="18"
            height="10"
            rx="3"
            className="fill-ink-3 stroke-ink"
            strokeDasharray="4 3"
            opacity={0.55}
          />
        </svg>
        {t("tentative")}
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="12" height="12" aria-hidden>
          <polygon points="6,0 12,6 6,12 0,6" className="fill-ink" />
        </svg>
        {t("milestone")}
      </li>
    </ul>
  );
}

/** Everything the roadmap knows about one item: dates, size, dependencies, tasks. */
function Detail({
  item,
  roadmap,
  today,
}: {
  item: Item;
  roadmap: Roadmap;
  today: string;
}) {
  const t = useTranslations("console.roadmap.detail");
  const format = useFormatter();
  const day = (d: string) =>
    format.dateTime(new Date(`${d}T12:00:00Z`), { dateStyle: "medium" });
  const deps = dependencies(item, roadmap);
  const tasks = item.tasks ?? [];
  const questions = item.questions ?? [];
  const links = item.links ?? [];
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] text-ink-3">{item.label}</span>
        <StatusBadge status={item.status} late={isLate(item, today)} />
        {item.tentative && (
          <span className="text-[12px] text-ink-3">{t("tentative")}</span>
        )}
      </div>
      <h2 className="type-heading mt-1">{item.name}</h2>
      <p className="mt-1 text-[13px] text-ink-3">
        {t("dates", {
          start: day(item.start),
          end: day(item.end),
          days: daysBetween(item.start, item.end) + 1,
        })}
        {item.size && ` · ${t("size", { size: item.size })}`}
      </p>
      {item.note && <p className="mt-3 text-[14px] text-ink-2">{item.note}</p>}
      {deps.length > 0 && (
        <p className="mt-3 text-[13px] text-ink-2">
          <span className="text-ink-3">{t("dependsOn")} </span>
          {deps.map((d) => `${d.label} ${d.name}`).join(" · ")}
        </p>
      )}
      {tasks.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[13px] font-semibold text-ink-2">{t("tasks")}</h3>
          <ol className="mt-1.5 space-y-1.5 text-[14px] text-ink-2">
            {tasks.map((task) => (
              <li key={task.day} className="flex gap-3">
                <span className="w-28 shrink-0 font-mono text-[12px] text-ink-3">
                  {task.day}
                </span>
                <span>{task.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {questions.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[13px] font-semibold text-ink-2">
            {t("questions")}
          </h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[14px] text-ink-2">
            {questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {links.length > 0 && (
        <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {links.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline-offset-2 hover:underline"
            >
              {l.label}
            </a>
          ))}
        </p>
      )}
    </Card>
  );
}

function Milestones({
  milestones,
  today,
}: {
  milestones: Milestone[];
  today: string;
}) {
  const t = useTranslations("console.roadmap");
  const format = useFormatter();
  const sorted = [...milestones].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <Card>
      <h2 className="type-heading mb-3">{t("milestones")}</h2>
      <ul className="space-y-2">
        {sorted.map((m) => {
          const days = daysBetween(today, m.date);
          return (
            <li key={m.id} className="flex items-baseline gap-3 text-[14px]">
              <span className="w-24 shrink-0 font-mono text-[12px] text-ink-3">
                {format.dateTime(new Date(`${m.date}T12:00:00Z`), {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <span
                className={cn("flex-1", m.status === "done" && "text-ink-3")}
              >
                {m.name}
              </span>
              <span className="text-[12px] text-ink-3">
                {m.status === "done"
                  ? t("status.done")
                  : days < 0
                    ? t("daysAgo", { days: -days })
                    : days === 0
                      ? t("today")
                      : t("inDays", { days })}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * Product roadmap: the plans (V4, OPS), the phone app and the platform work as a Gantt,
 * from the file committed with the backend (`console/apps/roadmap/roadmap.json`). A
 * click on a row opens the item: dates, size, dependencies, its tasks day by day, the
 * open questions and links.
 */
export function RoadmapApp({ semver }: AppPageProps) {
  const t = useTranslations("console.roadmap");
  const format = useFormatter();
  const errorText = useErrorText();
  const [selected, setSelected] = useState<string | null>(null);
  const today = todayIso();
  const roadmap = useQuery({
    queryKey: ["roadmap"],
    queryFn: () => ops.get<Roadmap>("roadmap"),
  });
  if (roadmap.isError)
    return <ErrorBanner message={errorText(roadmap.error)} />;
  if (roadmap.isPending) return <Skeleton className="h-96" />;
  const data = roadmap.data;
  const item = data.items.find((i) => i.id === selected) ?? null;
  return (
    <div data-version={semver} className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-2xl text-ink-2">{t("intro")}</p>
        <p className="text-[13px] text-ink-3">
          {t("updated", {
            date: format.dateTime(new Date(`${data.updated}T12:00:00Z`), {
              dateStyle: "long",
            }),
          })}
        </p>
      </div>
      <Legend />
      <Gantt
        roadmap={data}
        today={today}
        selected={selected}
        onSelect={setSelected}
      />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        {item ? (
          <Detail item={item} roadmap={data} today={today} />
        ) : (
          <Card>
            <p className="text-[14px] text-ink-3">{t("pick")}</p>
          </Card>
        )}
        <Milestones milestones={data.milestones ?? []} today={today} />
      </div>
      <details className="text-[13px] text-ink-3">
        <summary className="cursor-pointer">{t("assumptions")}</summary>
        <p className="mt-2 max-w-3xl">{data.assumptions}</p>
      </details>
    </div>
  );
}
