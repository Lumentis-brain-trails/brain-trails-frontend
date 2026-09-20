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

export interface TaskBlock {
  key: string;
  label?: string | null;
  block_id: string;
  behaviour?: Behaviour | null;
  erp?: Erp | null;
  prestimulus?: Prestimulus | null;
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
  nogo_correct: "Withheld (no-go)",
  go_hit: "Docked (go)",
  error: "False dock",
  correct: "Correct dock",
};

export function TaskPanel({ block }: { block: TaskBlock }) {
  const b = block.behaviour;
  if (!b) return null;
  const quarters = b.quarters ?? [];

  return (
    <div className="space-y-3" data-testid={`task-${block.key}`}>
      <h3 className="text-[14px] font-semibold">
        {block.label ?? block.block_id}
        <span className="font-normal text-ink-3">
          {" "}
          · {b.n} trials ({b.n_go} go, {b.n_nogo} no-go)
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
        <Stat label="Hits" value={pct(b.hit_rate)} />
        <Stat label="False docks" value={pct(b.commission_rate)} />
        <Stat
          label="Sensitivity (d′)"
          value={num(b.d_prime)}
          hint="Telling cargo from debris, apart from how readily you press."
        />
        <Stat
          label="Bias (c)"
          value={num(b.criterion)}
          hint="Above zero: holds back when unsure. Below: presses when unsure."
        />
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
          hint="Slowing on the trial after a false dock: noticing and adjusting."
        />
      </dl>

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
                <th className="pl-3 text-right font-medium">Hits</th>
                <th className="pl-3 text-right font-medium">False docks</th>
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
                  <td className="pl-3 text-right tabular-nums">
                    {pct(q.commission_rate)}
                  </td>
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
          False docks by kind:{" "}
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
            windows={[
              { name: "N2", from: 200, to: 350, value: block.erp.stimulus.n2 },
            ]}
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
