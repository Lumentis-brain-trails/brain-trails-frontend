"use client";

/**
 * How a task block was performed, and what the signal did around its trials.
 *
 * The backend computes all of it (`BlockMetricsOut.behaviour`, `.erp`, `.prestimulus`);
 * this component only decides what is safe to show and how. Three rules shape it:
 *
 * - No single number is a verdict. The task spec is explicit that fewer false docks can
 *   simply mean pressing less, so hits, false docks, sensitivity, bias and speed always
 *   sit side by side, and the backend's `flags` are spelled out above them.
 * - A waveform is drawn only when the backend sent one: under its minimum of clean
 *   epochs `wave_uv` is null, and the panel says how many epochs there were instead of
 *   drawing noise that looks like a finding.
 * - Negative is plotted up, the ERP convention, and the windows the numbers come from
 *   are shaded, so "N2 −3.1 µV" can be checked against the picture by eye.
 */

import type { components } from "@/lib/api-types";

type Behaviour = components["schemas"]["BehaviourOut"];
type Erp = components["schemas"]["ErpOut"];
type Locked = components["schemas"]["ErpLockedOut"];
type Prestimulus = components["schemas"]["PrestimulusOut"];
type Interoception = components["schemas"]["InteroceptionOut"];

export interface TaskBlock {
  key: string;
  label?: string | null;
  block_id: string;
  behaviour?: Behaviour | null;
  erp?: Erp | null;
  prestimulus?: Prestimulus | null;
  interoception?: Interoception | null;
}

const FLAG_TEXT: Record<string, string> = {
  few_trials:
    "Few trials were scored: read every number here as a rough guide.",
  many_invalid:
    "Many trials were excluded for timing (a hidden tab or a stalled page).",
  low_hit_rate:
    "Fewer than half of the go trials were answered, so a low false-dock rate may only mean pressing less.",
  many_anticipations:
    "Many presses came faster than a target can be recognised: some answers were guesses.",
  clock_estimated:
    "Markers were stamped without the headband's clock, so nothing is shown around the trials.",
};

const SERIES = [
  { color: "var(--chart-4, #e9668a)" },
  { color: "var(--chart-1, #7c8cff)" },
];

const CONDITION_TEXT: Record<string, string> = {
  nogo_correct: "Withheld",
  go_hit: "Answered",
  incongruent: "Arrows disagree",
  congruent: "Arrows agree",
  error: "Error",
  correct: "Correct answer",
};

/** A level of a task's design, in a reader's words; unknown ones keep their name. */
const LEVEL_TEXT: Record<string, string> = {
  congruent: "Arrows agree",
  incongruent: "Arrows disagree",
  match: "Match",
  nonmatch: "No match",
  lure: "Near miss",
  none: "No cue",
  center: "Cue at the cross",
  double: "Cue above and below",
  spatial: "Cue at the place",
};

const EFFECT_TEXT: Record<string, { label: string; hint: string }> = {
  congruency_ms: {
    label: "Conflict cost",
    hint: "How much slower when the outer arrows disagree: the work of shutting them out.",
  },
  alerting_ms: {
    label: "Alerting",
    hint: "How much a warning that says only 'now' speeds the answer (no cue minus double cue).",
  },
  orienting_ms: {
    label: "Orienting",
    hint: "How much knowing the place adds to a warning (centre cue minus cue at the place).",
  },
};

export function TaskPanel({ block }: { block: TaskBlock }) {
  const b = block.behaviour;
  if (!b)
    return block.interoception ? (
      <CountingPanel block={block} counting={block.interoception} />
    ) : null;
  const quarters = b.quarters ?? [];
  // A task with no withhold trials (arrows, coding) has wrong keys, not false alarms.
  const choice = b.n_nogo === 0;
  const levels = Object.entries({ ...(b.conditions ?? {}), ...(b.cues ?? {}) });
  const effects = Object.entries(b.effects ?? {});

  return (
    <div className="space-y-3" data-testid={`task-${block.key}`}>
      <h3 className="text-[14px] font-semibold">
        {block.label ?? block.block_id}
        <span className="font-normal text-ink-3">
          {" "}
          · {b.n} trials
          {choice ? "" : ` (${b.n_go} go, ${b.n_nogo} no-go)`}
          {b.n_practice > 0 ? `, ${b.n_practice} practice` : ""}
          {b.n_excluded > 0 ? `, ${b.n_excluded} excluded` : ""}
        </span>
      </h3>

      {b.flags.length > 0 && (
        <ul className="space-y-1 rounded-md bg-[var(--warn-soft)] p-2 text-[13px] text-[var(--warn)]">
          {b.flags.map((flag) => (
            <li key={flag}>{FLAG_TEXT[flag] ?? flag}</li>
          ))}
        </ul>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-4">
        <Stat label={choice ? "Correct" : "Hits"} value={pct(b.hit_rate)} />
        {choice ? (
          <>
            <Stat
              label="Wrong key"
              value={pct(b.error_rate)}
              hint="Answered, but the other way."
            />
            <Stat
              label="Too slow"
              value={pct(b.omission_rate)}
              hint="No answer inside the time allowed."
            />
            <Stat
              label="Correct per minute"
              value={
                b.throughput_per_min === null ||
                b.throughput_per_min === undefined
                  ? "—"
                  : b.throughput_per_min.toFixed(1)
              }
              hint="The score of a timed block: right answers for each minute of task."
            />
          </>
        ) : (
          <>
            <Stat label="False alarms" value={pct(b.commission_rate)} />
            <Stat
              label="Sensitivity (d′)"
              value={num(b.d_prime)}
              hint="Telling targets from the rest, apart from how readily you press."
            />
            <Stat
              label="Bias (c)"
              value={num(b.criterion)}
              hint="Above zero: holds back when unsure. Below: presses when unsure."
            />
          </>
        )}
        <Stat label="Median RT" value={ms(b.rt.median_ms)} />
        <Stat
          label="RT spread (MAD)"
          value={ms(b.rt.mad_ms)}
          hint="How steady the response speed was."
        />
        <Stat
          label="Slow tail (τ)"
          value={ms(b.ex_gaussian?.tau_ms)}
          hint="The weight of occasional very slow responses: momentary lapses of attention."
        />
        <Stat
          label="After an error"
          value={signedMs(b.post_error_slowing_ms)}
          hint="Slowing on the trial after a mistake: noticing and adjusting."
        />
      </dl>

      {effects.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
          {effects.map(([name, value]) => (
            <Stat
              key={name}
              label={EFFECT_TEXT[name]?.label ?? name}
              value={signedMs(value)}
              hint={EFFECT_TEXT[name]?.hint}
            />
          ))}
        </dl>
      )}

      {levels.length > 1 && (
        <table className="w-full text-[13px]">
          <thead className="text-ink-3">
            <tr>
              <th className="text-left font-medium">Kind of trial</th>
              <th className="pl-3 text-right font-medium">Trials</th>
              <th className="pl-3 text-right font-medium">Right</th>
              <th className="pl-3 text-right font-medium">Median RT</th>
            </tr>
          </thead>
          <tbody>
            {levels.map(([name, level]) => (
              <tr key={name} className="border-t border-hairline">
                <td className="py-1">{LEVEL_TEXT[name] ?? name}</td>
                <td className="pl-3 text-right tabular-nums">{level.n}</td>
                <td className="pl-3 text-right tabular-nums">
                  {pct(level.accuracy)}
                </td>
                <td className="pl-3 text-right tabular-nums">
                  {ms(level.median_rt_ms)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {quarters.length === 4 && (
        <div>
          <p className="type-caption text-ink-3">
            Across the block, in quarters
            {b.rt_slope_ms_per_min !== null &&
            b.rt_slope_ms_per_min !== undefined
              ? ` · speed drift ${signedMs(b.rt_slope_ms_per_min)}/min`
              : ""}
          </p>
          <table className="w-full text-[13px]">
            <thead className="text-ink-3">
              <tr>
                <th className="text-left font-medium">Quarter</th>
                <th className="pl-3 text-right font-medium">
                  {choice ? "Correct" : "Hits"}
                </th>
                {!choice && (
                  <th className="pl-3 text-right font-medium">False alarms</th>
                )}
                <th className="pl-3 text-right font-medium">Median RT</th>
              </tr>
            </thead>
            <tbody>
              {quarters.map((q, i) => (
                <tr key={i} className="border-t border-hairline">
                  <td className="py-1">{i + 1}</td>
                  <td className="pl-3 text-right tabular-nums">
                    {pct(q.hit_rate)}
                  </td>
                  {!choice && (
                    <td className="pl-3 text-right tabular-nums">
                      {pct(q.commission_rate)}
                    </td>
                  )}
                  <td className="pl-3 text-right tabular-nums">
                    {ms(q.median_rt_ms)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {Object.keys(b.nogo_types ?? {}).length > 0 && (
        <p className="text-[13px] text-ink-2">
          False alarms by kind:{" "}
          {Object.entries(b.nogo_types)
            .map(
              ([name, v]) =>
                `${name.replace("_", " + ")} ${v.commissions}/${v.n}`
            )
            .join(" · ")}
        </p>
      )}

      {block.erp && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ErpChart
            title="Around the target"
            locked={block.erp.stimulus}
            windows={
              block.erp.stimulus.n2
                ? [
                    {
                      name: "N2",
                      from: 200,
                      to: 350,
                      value: block.erp.stimulus.n2,
                    },
                  ]
                : []
            }
            minEpochs={block.erp.min_epochs.stimulus}
          />
          <ErpChart
            title="Around the press"
            locked={block.erp.response}
            windows={[
              { name: "ERN", from: 0, to: 100, value: block.erp.response.ern },
              { name: "Pe", from: 200, to: 400, value: block.erp.response.pe },
            ]}
            minEpochs={block.erp.min_epochs.response}
          />
          <p className="type-caption text-ink-3 sm:col-span-2">
            Mean of {block.erp.channels.join(" and ")}, negative up, epochs over{" "}
            {block.erp.reject_uv} µV dropped. A headband has no electrode over
            the top of the head, where these components are largest, so
            amplitudes are small and compare only with other recordings made the
            same way.
          </p>
        </div>
      )}

      {block.prestimulus && <PrestimulusLine p={block.prestimulus} />}
    </div>
  );
}

/** A heartbeat-counting block: what was reported against what the pulse sensor counted. */
function CountingPanel({
  block,
  counting,
}: {
  block: TaskBlock;
  counting: Interoception;
}) {
  return (
    <div className="space-y-3" data-testid={`task-${block.key}`}>
      <h3 className="text-[14px] font-semibold">
        {block.label ?? block.block_id}
        <span className="font-normal text-ink-3">
          {" "}
          · {counting.intervals.length} rounds
        </span>
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        <Stat
          label="Accuracy"
          value={pct(counting.accuracy)}
          hint="1 minus the share of beats missed or added, averaged over the rounds. 100% is a perfect count."
        />
        <Stat
          label="Confidence"
          value={
            counting.confidence === null || counting.confidence === undefined
              ? "—"
              : `${counting.confidence.toFixed(1)} / 10`
          }
        />
      </dl>
      <table className="w-full text-[13px]">
        <thead className="text-ink-3">
          <tr>
            <th className="text-left font-medium">Round</th>
            <th className="pl-3 text-right font-medium">Counted</th>
            <th className="pl-3 text-right font-medium">Happened</th>
            <th className="pl-3 text-right font-medium">Accuracy</th>
          </tr>
        </thead>
        <tbody>
          {counting.intervals.map((row) => (
            <tr key={row.interval_index} className="border-t border-hairline">
              <td className="py-1">
                {row.duration_s === null || row.duration_s === undefined
                  ? row.interval_index + 1
                  : `${Math.round(row.duration_s)} s`}
              </td>
              <td className="pl-3 text-right tabular-nums">{row.reported}</td>
              <td className="pl-3 text-right tabular-nums">
                {row.actual ?? "—"}
              </td>
              <td className="pl-3 text-right tabular-nums">
                {pct(row.accuracy)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="type-caption text-ink-3">
        {counting.n_scored === 0
          ? "The real beats could not be counted: this headband has no pulse sensor, or the pulse was not clean while counting."
          : "Real beats come from the headband's pulse sensor. Counting can be helped along by guessing the time, so read this as a score on this task, not as a trait."}
      </p>
    </div>
  );
}

function PrestimulusLine({ p }: { p: Prestimulus }) {
  if (p.rho === null || p.rho === undefined) return null;
  const strength =
    Math.abs(p.rho) < 0.1
      ? "did not track"
      : p.rho > 0
        ? "went with slower"
        : "went with faster";
  return (
    <p className="text-[13px] text-ink-2">
      Alpha in the second before a target {strength} responses (ρ ={" "}
      {p.rho.toFixed(2)}, {p.n_hits} trials
      {p.p_value !== null && p.p_value !== undefined
        ? `, p = ${p.p_value < 0.001 ? "<0.001" : p.p_value.toFixed(3)}`
        : ""}
      ).
    </p>
  );
}

const W = 320;
const H = 140;
const PAD = 4;

interface ErpWindow {
  name: string;
  from: number;
  to: number;
  value?: Record<string, number | null> | null;
}

export function ErpChart({
  title,
  locked,
  windows,
  minEpochs,
}: {
  title: string;
  locked: Locked;
  windows: ErpWindow[];
  minEpochs: number;
}) {
  const times = locked.times_ms;
  const entries = Object.entries(locked.conditions);
  const drawn = entries.filter(([, c]) => c.wave_uv);
  const t0 = times[0] ?? 0;
  const t1 = times.at(-1) ?? 1;
  const peak = Math.max(
    1,
    ...drawn.flatMap(([, c]) => (c.wave_uv ?? []).map((v) => Math.abs(v)))
  );
  const x = (t: number) => PAD + ((t - t0) / (t1 - t0)) * (W - 2 * PAD);
  // negative up: a positive voltage moves down the screen
  const y = (v: number) => H / 2 + (v / peak) * (H / 2 - PAD);

  return (
    <figure className="space-y-1">
      <figcaption className="text-[13px] font-medium">{title}</figcaption>
      {drawn.length > 0 ? (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`${title}: averaged signal by outcome`}
        >
          {windows.map((w) => (
            <rect
              key={w.name}
              x={x(w.from)}
              y={0}
              width={x(w.to) - x(w.from)}
              height={H}
              fill="var(--ink-3)"
              opacity={0.12}
            />
          ))}
          <line
            x1={PAD}
            x2={W - PAD}
            y1={H / 2}
            y2={H / 2}
            stroke="var(--hairline-strong)"
          />
          <line
            x1={x(0)}
            x2={x(0)}
            y1={0}
            y2={H}
            stroke="var(--hairline-strong)"
            strokeDasharray="3 3"
          />
          {entries.map(([name, c], i) =>
            c.wave_uv ? (
              <polyline
                key={name}
                fill="none"
                stroke={SERIES[i % SERIES.length].color}
                strokeWidth={1.5}
                points={c.wave_uv
                  .map((v, j) => `${x(times[j])},${y(v)}`)
                  .join(" ")}
              />
            ) : null
          )}
        </svg>
      ) : (
        <p className="type-caption text-ink-3">
          Not enough clean trials to average (needs {minEpochs}).
        </p>
      )}
      <ul className="type-caption text-ink-3">
        {entries.map(([name, c], i) => (
          <li key={name}>
            <span
              aria-hidden
              className="mr-1 inline-block h-2 w-2 rounded-full"
              style={{ background: SERIES[i % SERIES.length].color }}
            />
            {CONDITION_TEXT[name] ?? name}: {c.n} epochs
            {c.wave_uv ? "" : ` (needs ${minEpochs})`}
          </li>
        ))}
        {windows.map((w) =>
          w.value?.difference !== null && w.value?.difference !== undefined ? (
            <li key={w.name}>
              {w.name} ({w.from}–{w.to} ms), difference:{" "}
              {w.value.difference.toFixed(1)} µV
            </li>
          ) : null
        )}
      </ul>
    </figure>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div title={hint}>
      <dt className="text-ink-3">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function pct(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : `${Math.round(value * 100)}%`;
}

function num(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

function ms(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : `${Math.round(value)} ms`;
}

function signedMs(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} ms`;
}
