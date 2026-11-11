"use client";

/**
 * Neurofeedback on your own landscape (backend V4-0010).
 *
 * Choose where on your brain landscape a session should lead you - the focus preset,
 * computed from your own recordings, or points of your own - what you watch while you
 * train (a plane that takes off, two notes that come into tune, the ribbons drawing out
 * of their blur), and for how long. Start writes that into a protocol of yours and runs
 * it: the headband's EEG goes to the live service, which places every second of it on
 * your map, and the picture follows how close you are.
 *
 * Only your own map, in your personal workspace, with the `neurofeedback` and `live`
 * flags on. Without a map there is nothing to aim at yet: the page says so and sends you
 * to record first. It says plainly what the evidence is, and what this is not.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { TargetPicker } from "@/components/neurofeedback/TargetPicker";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Skeleton,
  cn,
} from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api";
import { type BrainLandscape, landscapeProblem } from "@/lib/brainLandscape";
import { useFeature } from "@/lib/features";
import {
  FEEDBACKS,
  type Feedback,
  MINUTES,
  personalProtocol,
  storeProtocol,
  storedProtocol,
} from "@/lib/neurofeedback/personal";
import type { ProtocolDetail } from "@/lib/protocol/catalog";
import { inWorkspace, useCurrentWorkspace } from "@/lib/workspace";

type Point = [number, number];
type Where = "focus" | "custom";

/** A custom point's radius, in blur widths of the map, as the preset's (backend). */
const RADIUS_SIGMAS = 1.5;

export default function NeurofeedbackPage() {
  const t = useTranslations("neurofeedback");
  const router = useRouter();
  const workspace = useCurrentWorkspace();
  const nfOn = useFeature("neurofeedback");
  const liveOn = useFeature("live");
  const enabled = nfOn && liveOn;
  const landscape = useQuery({
    queryKey: ["my-landscape"],
    queryFn: () => api.get<BrainLandscape>("landscape"),
    retry: false,
    enabled,
  });
  const map = landscape.data;
  const focus = map?.presets?.focus ?? null;
  const [where, setWhere] = useState<Where | null>(null);
  const shownWhere: Where = where ?? (focus ? "focus" : "custom");
  const [custom, setCustom] = useState<Point[]>([]);
  const [feedback, setFeedback] = useState<Feedback>("plane");
  const [minutes, setMinutes] = useState<number>(10);

  const radius = useMemo(() => {
    if (focus) return focus.radius;
    if (map?.sigma) return RADIUS_SIGMAS * map.sigma;
    if (!map) return 1;
    return (map.bounds[1] - map.bounds[0]) * 0.06;
  }, [focus, map]);
  const points: Point[] =
    shownWhere === "focus" && focus
      ? focus.points.map(([x, y]) => [x, y] as Point)
      : custom;

  const start = useMutation({
    mutationFn: async () => {
      if (!map) throw new Error("no map");
      const draft = personalProtocol(
        {
          targets: {
            points,
            radius,
            epoch: map.epoch,
            preset: shownWhere,
          },
          feedback,
          minutes,
        },
        {
          ready: t("protocol.ready"),
          how: t(`protocol.how.${feedback}`),
          start: t("protocol.start"),
          label: t("protocol.label"),
          warning: t("protocol.warning"),
        }
      );
      const id = await saveDraft(draft, t("protocol.title"), workspace);
      await api.post<ProtocolDetail>(`protocols/${id}/publish`, {});
      return id;
    },
    onSuccess: (id) => router.push(`/protocols/${id}/run`),
  });

  if (!enabled)
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <EmptyState title={t("title")} text={t("off")} />
      </main>
    );

  const problem = map ? null : landscapeProblem(problemOf(landscape.error));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="type-title">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-pretty text-ink-2">{t("intro")}</p>
      </header>

      {landscape.isLoading && <Skeleton className="h-[420px]" />}
      {problem && (
        <EmptyState
          title={t("noMap.title")}
          text={t(problem === "building" ? "noMap.building" : "noMap.text")}
          action={
            <Link href="/protocols" className="text-accent underline">
              {t("noMap.record")}
            </Link>
          }
        />
      )}

      {map && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-labelledby="nf-where">
            <h2 id="nf-where" className="type-heading mb-2">
              {t("where.title")}
            </h2>
            <div
              role="radiogroup"
              aria-labelledby="nf-where"
              className="mb-3 flex flex-wrap gap-2"
            >
              <Choice
                checked={shownWhere === "focus"}
                disabled={!focus}
                onClick={() => setWhere("focus")}
                label={t("where.focus")}
              />
              <Choice
                checked={shownWhere === "custom"}
                onClick={() => {
                  if (shownWhere === "focus" && focus && custom.length === 0)
                    setCustom(focus.points.map(([x, y]) => [x, y] as Point));
                  setWhere("custom");
                }}
                label={t("where.custom")}
              />
            </div>
            <p className="type-caption mb-3 text-ink-3">
              {shownWhere === "focus" && focus
                ? t("where.focusHelp", { windows: focus.windows })
                : focus
                  ? t("where.customHelp")
                  : t("where.noPreset")}
            </p>
            <Card className="p-2">
              <TargetPicker
                landscape={map}
                points={points}
                radius={radius}
                editable={shownWhere === "custom"}
                onChange={setCustom}
                title={t("where.map")}
              />
            </Card>
          </section>

          <aside className="flex flex-col gap-6">
            <section aria-labelledby="nf-what">
              <h2 id="nf-what" className="type-heading mb-2">
                {t("what.title")}
              </h2>
              <div
                role="radiogroup"
                aria-labelledby="nf-what"
                className="grid gap-2"
              >
                {FEEDBACKS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={feedback === f}
                    onClick={() => setFeedback(f)}
                    className={cn(
                      "rounded-[var(--radius-control)] border px-3 py-2 text-left transition-colors",
                      feedback === f
                        ? "border-accent bg-accent-soft"
                        : "border-hairline hover:border-hairline-strong"
                    )}
                  >
                    <span className="block text-[15px] text-ink">
                      {t(`what.${f}.label`)}
                    </span>
                    <span className="block text-[13px] text-ink-2">
                      {t(`what.${f}.text`)}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section aria-labelledby="nf-long">
              <h2 id="nf-long" className="type-heading mb-2">
                {t("long.title")}
              </h2>
              <div
                role="radiogroup"
                aria-labelledby="nf-long"
                className="flex gap-2"
              >
                {MINUTES.map((m) => (
                  <Choice
                    key={m}
                    checked={minutes === m}
                    onClick={() => setMinutes(m)}
                    label={t("long.minutes", { n: m })}
                  />
                ))}
              </div>
              <p className="type-caption mt-2 text-ink-3">{t("long.help")}</p>
            </section>

            {start.error && (
              <ErrorBanner
                message={
                  start.error instanceof ApiRequestError
                    ? start.error.message
                    : t("failed")
                }
              />
            )}
            <Button
              disabled={points.length === 0 || start.isPending}
              onClick={() => start.mutate()}
            >
              {start.isPending ? t("starting") : t("start")}
            </Button>
          </aside>
        </div>
      )}

      <Card inset className="mt-8 p-4">
        <h2 className="type-heading mb-2">{t("evidence.title")}</h2>
        <ul className="list-disc space-y-1 pl-5 text-[14px] text-ink-2">
          <li>{t("evidence.preset")}</li>
          <li>{t("evidence.studies")}</li>
          <li>{t("evidence.delay")}</li>
          <li>{t("evidence.not")}</li>
        </ul>
      </Card>
    </main>
  );
}

function Choice({
  checked,
  disabled = false,
  onClick,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-[14px] transition-colors disabled:opacity-40",
        checked
          ? "border-accent bg-accent-soft text-ink"
          : "border-hairline text-ink-2 hover:border-hairline-strong"
      )}
    >
      {label}
    </button>
  );
}

/** Update the person's neurofeedback protocol, or make it the first time. */
async function saveDraft(
  draft: unknown,
  title: string,
  workspace: { id: string } | undefined
): Promise<string> {
  const known = storedProtocol();
  if (known) {
    try {
      const detail = await api.get<ProtocolDetail>(`protocols/${known}`);
      await api.put(
        `protocols/${known}/draft`,
        { draft },
        { ifMatch: detail.draft_rev ?? 1 }
      );
      return known;
    } catch (error) {
      // gone, archived or not ours any more: a new one below
      if (!(error instanceof ApiRequestError)) throw error;
    }
  }
  const made = await api.post<ProtocolDetail>(
    inWorkspace("protocols", workspace),
    { title, draft }
  );
  storeProtocol(made.id);
  return made.id;
}

function problemOf(error: unknown) {
  return error instanceof ApiRequestError
    ? { status: error.status, error: { code: error.error.code } }
    : error
      ? { status: 0 }
      : null;
}
