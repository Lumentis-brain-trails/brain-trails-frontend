/**
 * The mark: one soft disc of light, split by a trail.
 *
 * It is the entry screen's two ribbons folded into a circle - the warm one and
 * the cool one, each fading out at its rim - held apart by the only hard edge in
 * the artwork, an S-shaped trail that runs off both ends.
 * Colour never touches the chrome around it, so this stays the one coloured
 * object in the app (docs/DESIGN.md).
 *
 * The mark carries no ground of its own: the two halves fade to transparent at
 * their rim and the trail between them is punched out of the same mask, so the
 * surface behind shows through both. That is what makes it the same object on the
 * white canvas, on the dark one and on the entry screen's near-black, with no
 * per-appearance artwork and nothing to keep in step with the theme.
 *
 * The gradient ids are fixed rather than generated: every instance defines the
 * same stops, so a second instance on the page resolves to identical artwork and
 * the component stays free of hooks (it renders on the server, with no JS).
 */
/** The trail: an S through the centre, running off both ends of the artwork. */
const TRAIL =
  "M512 72 C512 150 560 190 640 262 C744 356 700 470 512 512 C324 554 280 668 384 762 C464 834 512 874 512 952";

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
      viewBox="0 0 1024 1024"
      aria-hidden
      className={className}
    >
      <defs>
        {/* the two sides of the trail, each out to the edge of the artwork */}
        <clipPath id="bt-mark-warm-side">
          <path d="M512 0 L512 72 C512 150 560 190 640 262 C744 356 700 470 512 512 C324 554 280 668 384 762 C464 834 512 874 512 952 L512 1024 L0 1024 L0 0 Z" />
        </clipPath>
        <clipPath id="bt-mark-cool-side">
          <path d="M512 0 L512 72 C512 150 560 190 640 262 C744 356 700 470 512 512 C324 554 280 668 384 762 C464 834 512 874 512 952 L512 1024 L1024 1024 L1024 0 Z" />
        </clipPath>

        {/* each ribbon's body in the middle, its cool rim towards the outside */}
        <radialGradient
          id="bt-mark-warm"
          gradientUnits="userSpaceOnUse"
          cx="512"
          cy="512"
          r="440"
        >
          <stop offset="0" stopColor="#f9ba4a" />
          <stop offset=".4" stopColor="#f6c862" />
          <stop offset=".5" stopColor="#d9dc9c" />
          <stop offset=".6" stopColor="#7fe0d6" />
          <stop offset="1" stopColor="#4fd0ee" />
        </radialGradient>
        <radialGradient
          id="bt-mark-cool"
          gradientUnits="userSpaceOnUse"
          cx="512"
          cy="512"
          r="440"
        >
          <stop offset="0" stopColor="#ff9cce" />
          <stop offset=".4" stopColor="#ee94d8" />
          <stop offset=".5" stopColor="#c88ae6" />
          <stop offset=".6" stopColor="#a082ee" />
          <stop offset="1" stopColor="#6a70f0" />
        </radialGradient>

        {/* the disc has no rim: it only fades, over most of its radius */}
        <radialGradient
          id="bt-mark-fade"
          gradientUnits="userSpaceOnUse"
          cx="512"
          cy="512"
          r="440"
        >
          <stop offset="0" stopColor="#fff" />
          <stop offset=".26" stopColor="#fff" stopOpacity=".97" />
          <stop offset=".4" stopColor="#fff" stopOpacity=".88" />
          <stop offset=".52" stopColor="#fff" stopOpacity=".72" />
          <stop offset=".64" stopColor="#fff" stopOpacity=".52" />
          <stop offset=".75" stopColor="#fff" stopOpacity=".32" />
          <stop offset=".85" stopColor="#fff" stopOpacity=".16" />
          <stop offset=".93" stopColor="#fff" stopOpacity=".06" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask
          id="bt-mark-disc"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="1024"
          height="1024"
        >
          <rect width="1024" height="1024" fill="url(#bt-mark-fade)" />
          <path
            d={TRAIL}
            fill="none"
            stroke="#000"
            strokeWidth="48"
            strokeLinecap="round"
          />
        </mask>

        <filter id="bt-mark-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="64" />
        </filter>
      </defs>

      <g mask="url(#bt-mark-disc)">
        <g clipPath="url(#bt-mark-warm-side)">
          <rect width="1024" height="1024" fill="url(#bt-mark-warm)" />
          {/* the warm ribbon's head, and the yellow further down its body */}
          <circle
            cx="500"
            cy="352"
            r="120"
            fill="#ffd27a"
            filter="url(#bt-mark-blur)"
          />
          <circle
            cx="330"
            cy="560"
            r="90"
            fill="#f4de80"
            opacity=".8"
            filter="url(#bt-mark-blur)"
          />
        </g>
        <g clipPath="url(#bt-mark-cool-side)">
          <rect width="1024" height="1024" fill="url(#bt-mark-cool)" />
          <circle
            cx="524"
            cy="672"
            r="120"
            fill="#ffb4da"
            filter="url(#bt-mark-blur)"
          />
          <circle
            cx="694"
            cy="464"
            r="90"
            fill="#e28ee2"
            opacity=".8"
            filter="url(#bt-mark-blur)"
          />
        </g>
      </g>
    </svg>
  );
}
