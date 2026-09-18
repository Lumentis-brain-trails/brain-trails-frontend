"use client";

import { useEffect, useRef } from "react";

/**
 * The brand's two ribbons of light, tucked into opposite corners of the entry
 * screen: a wide body with a rounded head, a cool rim bleeding along one side,
 * drifting slowly in and out of frame.
 *
 * Painted on a canvas rather than with CSS gradients because the shape follows a
 * curve and the colour runs along it; a stack of blurred radial gradients cannot
 * do that without stair-stepped edges. Drawn small and upscaled, with a canvas
 * blur on top, so the edges stay soft at any viewport size.
 *
 * Decorative only (`aria-hidden`): it carries no information. Animation stops
 * when the tab is hidden and never starts under `prefers-reduced-motion`, which
 * leaves the first frame painted.
 */

type Palette = {
  tail: [number, number, number];
  head: [number, number, number];
};

type Ribbon = {
  body: Palette;
  rim: Palette;
  /** Which side of the path the cool rim bleeds onto. */
  rimSide: 1 | -1;
  /** Cubic Bezier through the shape, in fractions of the viewport. p0 is the tail. */
  p0: [number, number];
  p1: [number, number];
  p2: [number, number];
  p3: [number, number];
  headRadius: number;
  tailRadius: number;
  /** Slide in and out of the corner along this vector, in fractions of the viewport. */
  travel: [number, number];
  /** Seconds for one in-and-out cycle. */
  period: number;
  phase: number;
};

/** Render size divisor; the softness comes from BLUR_LOW, not from the upscale. */
const SCALE = 3;
/** Blur radius in low-resolution pixels (roughly three times that on screen). */
const BLUR_LOW = 5;
/** Samples along each ribbon's curve. */
const STEPS = 56;

const RIBBONS: Ribbon[] = [
  {
    // top-left: enters from the left edge, yellow body with a cyan rim underneath
    body: { tail: [244, 222, 128], head: [249, 186, 74] },
    rim: { tail: [96, 216, 232], head: [150, 226, 200] },
    rimSide: 1,
    p0: [-0.14, 0.02],
    p1: [0.02, 0.12],
    p2: [0.1, 0.26],
    p3: [0.24, 0.15],
    headRadius: 0.072,
    tailRadius: 0.038,
    travel: [0.1, 0.03],
    period: 12,
    phase: 0,
  },
  {
    // bottom-right: rises from the bottom edge, pink body with a violet rim above
    body: { tail: [226, 142, 226], head: [255, 156, 206] },
    rim: { tail: [112, 116, 238], head: [160, 130, 238] },
    rimSide: -1,
    p0: [0.56, 1.14],
    p1: [0.66, 0.96],
    p2: [0.76, 0.92],
    p3: [0.9, 0.84],
    headRadius: 0.078,
    tailRadius: 0.036,
    travel: [-0.08, -0.06],
    period: 14,
    phase: 2.2,
  },
];

type Rgb = [number, number, number];
type Point = [number, number];

function rgba(c: Rgb, a: number): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function bezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  return [
    u * u * u * p0[0] +
      3 * u * u * t * p1[0] +
      3 * u * t * t * p2[0] +
      t ** 3 * p3[0],
    u * u * u * p0[1] +
      3 * u * u * t * p1[1] +
      3 * u * t * t * p2[1] +
      t ** 3 * p3[1],
  ];
}

/**
 * Stamp discs along the curve: radius grows towards the head, colour runs from
 * `colors.tail` to `colors.head`, and `offset` (in radii) shifts the whole pass
 * sideways so a second pass can sit half-out and read as a rim.
 */
function paintPass(
  ctx: CanvasRenderingContext2D,
  pts: Point[],
  ribbon: Ribbon,
  colors: Palette,
  alpha: number,
  grow: number,
  offset: number,
  unit: number
): void {
  const last = pts.length - 1;
  for (let i = 0; i <= last; i++) {
    const t = i / last;
    const [x, y] = pts[i];
    const [ax, ay] = pts[Math.max(0, i - 1)];
    const [bx, by] = pts[Math.min(last, i + 1)];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    const radius =
      (ribbon.tailRadius +
        (ribbon.headRadius - ribbon.tailRadius) * Math.pow(t, 1.8)) *
      unit *
      grow;
    ctx.fillStyle = rgba(
      mix(colors.tail, colors.head, Math.pow(t, 1.3)),
      alpha
    );
    ctx.beginPath();
    ctx.arc(
      x + nx * radius * offset,
      y + ny * radius * offset,
      radius,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
}

function drawRibbon(
  ctx: CanvasRenderingContext2D,
  ribbon: Ribbon,
  time: number,
  w: number,
  h: number
): void {
  const unit = Math.min(w, h) || 1;
  const k = (time / ribbon.period) * Math.PI * 2 + ribbon.phase;
  const inOut = (Math.sin(k) + 1) / 2;
  const ox = ribbon.travel[0] * w * (inOut - 0.5);
  const oy = ribbon.travel[1] * h * (inOut - 0.5);
  const sway = Math.sin(k * 1.6 + 0.8) * 0.05;
  const at = (p: Point, sx: number, sy: number): Point => [
    p[0] * w + ox + sx * w,
    p[1] * h + oy + sy * h,
  ];
  const p0 = at(ribbon.p0, 0, sway * 0.5);
  const p1 = at(ribbon.p1, sway * 0.6, -sway);
  const p2 = at(ribbon.p2, -sway, sway * 0.6);
  const p3 = at(ribbon.p3, 0, 0);
  const breathe = 1 + 0.06 * Math.sin(k * 2.1 + 1.3);

  const pts: Point[] = [];
  for (let i = 0; i <= STEPS; i++) pts.push(bezier(p0, p1, p2, p3, i / STEPS));

  // faint halo, then the cool rim pushed to one side, then the body over it
  paintPass(ctx, pts, ribbon, ribbon.body, 0.08, 1.55 * breathe, 0, unit);
  paintPass(
    ctx,
    pts,
    ribbon,
    ribbon.rim,
    0.7,
    1.06 * breathe,
    0.42 * ribbon.rimSide,
    unit
  );
  paintPass(
    ctx,
    pts,
    ribbon,
    ribbon.body,
    0.92,
    0.98 * breathe,
    -0.1 * ribbon.rimSide,
    unit
  );

  // a lighter centre in the head, still coloured: the shape never goes white
  const [hx, hy] = p3;
  const hr = ribbon.headRadius * unit * 0.85 * breathe;
  const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
  glow.addColorStop(0, rgba(mix(ribbon.body.head, [255, 255, 255], 0.22), 0.6));
  glow.addColorStop(1, rgba(ribbon.body.head, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fill();
}

export function CornerRibbons({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    // jsdom has no 2D context; the page still renders, just without the artwork
    if (!canvas || !ctx) return;

    const low = document.createElement("canvas");
    const lctx = low.getContext("2d");
    if (!lctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const canBlur = "filter" in lctx;
    let width = 0;
    let height = 0;
    let lowWidth = 0;
    let lowHeight = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = width;
      canvas.height = height;
      lowWidth = Math.max(1, Math.round(width / SCALE));
      lowHeight = Math.max(1, Math.round(height / SCALE));
      low.width = lowWidth;
      low.height = lowHeight;
    };

    const frame = (time: number) => {
      lctx.filter = "none";
      lctx.clearRect(0, 0, lowWidth, lowHeight);
      if (canBlur) lctx.filter = `blur(${BLUR_LOW}px)`;
      for (const ribbon of RIBBONS)
        drawRibbon(lctx, ribbon, time, lowWidth, lowHeight);
      lctx.filter = "none";
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(low, 0, 0, lowWidth, lowHeight, 0, 0, width, height);
    };

    let raf = 0;
    let clock = 0;
    let last = 0;
    let running = false;

    const loop = (now: number) => {
      if (last) clock += Math.min((now - last) / 1000, 0.05);
      last = now;
      frame(clock);
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (running || reduced.matches) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(loop);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const onResize = () => {
      resize();
      frame(clock);
    };

    const onVisibility = () => (document.hidden ? stop() : start());
    const onReducedChange = () => (reduced.matches ? stop() : start());

    resize();
    frame(clock);
    start();

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", onReducedChange);

    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", onReducedChange);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
