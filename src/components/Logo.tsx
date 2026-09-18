/**
 * The mark: a trail through a square. Monochrome by design so it sits quietly
 * in the header and inherits `currentColor`; the single accent dot is the
 * present moment at the end of the path.
 */
export function Logo({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      className={className}
    >
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.35"
      />
      <path
        d="M7 22c3-8 5-9 8-6s5 4 8-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23" cy="12" r="2.6" fill="var(--accent)" />
    </svg>
  );
}

export function Wordmark({ size = 17 }: { size?: number }) {
  return (
    <span
      className="flex items-center gap-2.5 font-semibold tracking-[-0.02em]"
      style={{ fontSize: size }}
    >
      <Logo size={Math.round(size * 1.5)} />
      Brain Trails
    </span>
  );
}
