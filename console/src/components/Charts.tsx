/**
 * The two small charts the strip and the apps draw: bars and a sparkline, plain SVG.
 * The product's Plotly stays out of the shell's first load (budget: LCP < 2 s); an app
 * that needs a real chart loads Plotly itself.
 */
export function Bars({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  const w = 100 / Math.max(1, values.length);
  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className="h-10 w-full"
    >
      {values.map((v, i) => {
        const h = (v / max) * 30;
        return (
          <rect
            key={i}
            x={i * w + w * 0.15}
            y={32 - h}
            width={w * 0.7}
            height={Math.max(h, 0.6)}
            rx={1}
            className="fill-ink-2"
          />
        );
      })}
    </svg>
  );
}

export function Sparkline({
  values,
  label,
}: {
  values: number[];
  label: string;
}) {
  const max = Math.max(1, ...values);
  const step = 100 / Math.max(1, values.length - 1);
  const points = values
    .map(
      (v, i) => `${(i * step).toFixed(2)},${(30 - (v / max) * 28).toFixed(2)}`
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className="h-10 w-full"
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth={1.6}
        vectorEffect="non-scaling-stroke"
        className="stroke-ink"
      />
    </svg>
  );
}
