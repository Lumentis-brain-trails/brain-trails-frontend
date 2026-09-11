/**
 * Static hero illustration for the landing page: a trail drawn through a
 * quiet plane, coloured from grey to the accent along time. It draws itself
 * once on load (decorative motion; removed under reduced-motion).
 */
export function TrailIllustration({ className }: { className?: string }) {
  const path =
    "M60 300 C 120 250, 150 330, 210 290 S 300 170, 360 200 S 430 300, 500 250 S 600 120, 660 160 S 740 250, 800 190";
  const dots: [number, number][] = [
    [60, 300],
    [130, 273],
    [210, 290],
    [285, 205],
    [360, 200],
    [440, 275],
    [500, 250],
    [580, 145],
    [660, 160],
    [735, 230],
    [800, 190],
  ];
  return (
    <svg
      viewBox="0 0 860 400"
      className={className}
      aria-hidden
      data-motion="decor"
    >
      <defs>
        <linearGradient id="trail-time" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--trail-0)" />
          <stop offset="1" stopColor="var(--trail-1)" />
        </linearGradient>
        <style>{`
          .trail-path { stroke-dasharray: 1200; stroke-dashoffset: 1200; animation: trail-draw 2.4s var(--m-out) 0.2s forwards; }
          .trail-dot { opacity: 0; animation: m-fade-in var(--m-base) var(--m-out) forwards; }
          @keyframes trail-draw { to { stroke-dashoffset: 0; } }
          @media (prefers-reduced-motion: reduce) {
            .trail-path { stroke-dashoffset: 0; animation: none; }
            .trail-dot { opacity: 1; animation: none; }
          }
        `}</style>
      </defs>
      {[80, 160, 240, 320].map((y) => (
        <line
          key={y}
          x1="20"
          x2="840"
          y1={y}
          y2={y}
          stroke="var(--hairline)"
          strokeWidth="1"
        />
      ))}
      {[180, 340, 500, 660].map((x) => (
        <line
          key={x}
          y1="20"
          y2="380"
          x1={x}
          x2={x}
          stroke="var(--hairline)"
          strokeWidth="1"
        />
      ))}
      <path
        d={path}
        className="trail-path"
        fill="none"
        stroke="url(#trail-time)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {dots.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={i === 0 || i === dots.length - 1 ? 8 : 5}
          className="trail-dot"
          style={{ animationDelay: `${0.3 + i * 0.2}s` }}
          fill={
            i === 0
              ? "var(--trail-start)"
              : i === dots.length - 1
                ? "var(--trail-end)"
                : "var(--surface)"
          }
          stroke={
            i === 0 || i === dots.length - 1 ? "none" : "url(#trail-time)"
          }
          strokeWidth="2.5"
        />
      ))}
    </svg>
  );
}
