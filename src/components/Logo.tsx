export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className="shrink-0"
    >
      <rect width="64" height="64" rx="14" fill="#4f46e5" />
      <polyline
        points="10,44 20,28 28,38 38,18 46,30 54,22"
        fill="none"
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="44" r="4" fill="#a5b4fc" />
      <circle cx="54" cy="22" r="4" fill="#fbbf24" />
    </svg>
  );
}
