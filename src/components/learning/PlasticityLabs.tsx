"use client";

/**
 * The Brain Plasticity module's moving pictures: the city at night (brain activity as
 * lights that come and go in patterns) and the ball on the energy landscape, in the
 * module's versions (hard, restless, soft, with the wind of neurofeedback).
 *
 * Both animate with `requestAnimationFrame` and stop when the page is hidden; the
 * physics is `@/lib/learning/ball`, seeded so a class sees the same run after a reset.
 */
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Segmented, cn } from "@/components/ui";
import {
  type Ball,
  type BallWorld,
  type WorldName,
  WORLDS,
  X_MAX,
  X_MIN,
  dropBall,
  heightAt,
  stepBall,
} from "@/lib/learning/ball";
import { seeded } from "@/lib/learning/signals";

/** Calls `tick(dt)` every animation frame while mounted and `running`. */
function useFrames(running: boolean, tick: (dt: number) => void) {
  const ref = useRef(tick);
  useEffect(() => {
    ref.current = tick;
  });
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    let id = requestAnimationFrame(function frame(now) {
      ref.current(Math.min(0.05, Math.max(0, (now - last) / 1000)));
      last = now;
      id = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(id);
  }, [running]);
}

const W = 300;
const H = 150;
const Y_TOP = 0.6;
const Y_BOTTOM = -3.2;
const sx = (x: number) => 10 + ((x - X_MIN) / (X_MAX - X_MIN)) * (W - 20);
const sy = (y: number) => 8 + ((Y_TOP - y) / (Y_TOP - Y_BOTTOM)) * (H - 16);
const fromSx = (px: number) => X_MIN + ((px - 10) / (W - 20)) * (X_MAX - X_MIN);

/** Where each version drops the ball first. */
const DROP: Record<WorldName, number> = {
  rocking: 0.4,
  stuck: 3.6,
  restless: 2.2,
  soft: 2.2,
  wind: 2.2,
};

/**
 * The ball on the landscape. `worlds` are the versions this step offers (two in the
 * first step, one after); a click or tap on the landscape drops the ball there.
 */
export function BallLab({ worlds }: { worlds: WorldName[] }) {
  const t = useTranslations("learning.labs.ball");
  const [name, setName] = useState<WorldName>(worlds[0]);
  const world: BallWorld = WORLDS[name];
  const rand = useRef(seeded(7));
  const [ball, setBall] = useState<Ball>(() => dropBall(world, DROP[name]));
  const [running, setRunning] = useState(true);
  const svg = useRef<SVGSVGElement>(null);

  const reset = (n: WorldName, x = DROP[n]) => {
    rand.current = seeded(7);
    setBall(dropBall(WORLDS[n], x));
  };

  useFrames(running, (dt) =>
    setBall((b) => {
      let next = b;
      const steps = 6;
      for (let i = 0; i < steps; i++)
        next = stepBall(world, next, (dt * 2) / steps, rand.current);
      return next;
    })
  );

  const ground = Array.from({ length: 121 }, (_, i) => {
    const x = X_MIN + (i * (X_MAX - X_MIN)) / 120;
    return `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(heightAt(world, ball, x)).toFixed(1)}`;
  }).join("");
  const original = Array.from({ length: 121 }, (_, i) => {
    const x = X_MIN + (i * (X_MAX - X_MIN)) / 120;
    return `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(heightAt(world, null, x)).toFixed(1)}`;
  }).join("");
  const by = heightAt(world, ball, ball.x);
  const total = ball.time.reduce((a, b) => a + b, 0) || 1;

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="type-subhead">{t(`${name}.title`)}</h3>
        <p className="mt-1 text-ink-2">{t(`${name}.text`)}</p>
      </div>
      {worlds.length > 1 && (
        <Segmented
          label={t("version")}
          value={name}
          onChange={(n) => {
            setName(n);
            reset(n);
          }}
          options={worlds.map((w) => ({ value: w, label: t(`${w}.short`) }))}
        />
      )}
      <div className="rounded-xl border border-hairline bg-surface p-2">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="mx-auto w-full max-w-3xl cursor-crosshair text-ink"
          role="img"
          aria-label={t("aria")}
          onClick={(e) => {
            const r = svg.current?.getBoundingClientRect();
            if (!r) return;
            const px = ((e.clientX - r.left) / r.width) * W;
            reset(
              name,
              Math.min(X_MAX - 0.2, Math.max(X_MIN + 0.2, fromSx(px)))
            );
          }}
        >
          {world.dig > 0 && (
            <path
              d={original}
              fill="none"
              stroke="currentColor"
              strokeDasharray="3 3"
              opacity={0.3}
            />
          )}
          <path
            d={`${ground}L${sx(X_MAX)},${H}L${sx(X_MIN)},${H}Z`}
            fill="color-mix(in srgb, #10b981 18%, var(--surface))"
            stroke="currentColor"
            strokeWidth={1.6}
          />
          {world.wind > 0 && world.target !== undefined && (
            <g stroke="#3b82f6" strokeWidth={1.2} opacity={0.6}>
              {[1, 2.5, 6.5, 8.5].map((x) => {
                const dir = Math.sign(world.target! - x);
                return (
                  <path
                    key={x}
                    d={`M${sx(x) - 8 * dir},28 l${16 * dir},0 m${-4 * dir},-3 l${4 * dir},3 l${-4 * dir},3`}
                    fill="none"
                  />
                );
              })}
              <text
                x={sx(world.target)}
                y={18}
                fontSize={9}
                textAnchor="middle"
                fill="#3b82f6"
                stroke="none"
              >
                {t("target")}
              </text>
            </g>
          )}
          <circle cx={sx(ball.x)} cy={sy(by) - 5} r={5} fill="#ef4444" />
        </svg>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {ball.time.map((tm, i) => (
          <div key={i}>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent"
                style={{ width: `${((tm / total) * 100).toFixed(0)}%` }}
              />
            </div>
            <span className="type-caption text-ink-3">
              {t("valley", { n: i + 1, p: Math.round((tm / total) * 100) })}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setRunning((r) => !r)}
        >
          {running ? t("pause") : t("play")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => reset(name)}>
          {t("reset")}
        </Button>
        <span className="type-caption text-ink-3">{t("hint")}</span>
      </div>
    </Card>
  );
}

const COLS = 26;
const ROWS = 14;

/**
 * A city at night seen from above, standing for the brain's activity: windows light up
 * where a few slow "waves" of activity pass, so the patterns move, merge and come back.
 */
export function CityLab() {
  const t = useTranslations("learning.labs.city");
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(true);
  useFrames(running, (dt) => setTime((x) => x + dt));
  const blobs = [0, 1, 2, 3].map((k) => ({
    x: COLS / 2 + Math.cos(time * (0.21 + k * 0.07) + k * 1.7) * COLS * 0.38,
    y: ROWS / 2 + Math.sin(time * (0.17 + k * 0.05) + k) * ROWS * 0.38,
  }));
  const r = seeded(9);
  return (
    <Card className="space-y-3">
      <div>
        <h3 className="type-subhead">{t("title")}</h3>
        <p className="mt-1 text-ink-2">{t("text")}</p>
      </div>
      <div className="overflow-hidden rounded-xl bg-[#0b1020] p-2">
        <svg
          viewBox={`0 0 ${COLS * 10} ${ROWS * 10}`}
          className="w-full"
          role="img"
          aria-label={t("aria")}
        >
          {Array.from({ length: COLS * ROWS }, (_, i) => {
            const cx = i % COLS;
            const cy = Math.floor(i / COLS);
            const base = r();
            const phase = r() * 6;
            let a = 0;
            for (const b of blobs)
              a += Math.exp(-(((cx - b.x) ** 2 + (cy - b.y) ** 2) / 14));
            a += 0.25 * Math.sin(time * 2 + phase) * base;
            const lit = Math.min(1, Math.max(0, a - 0.25 + base * 0.15));
            return (
              <rect
                key={i}
                x={cx * 10 + 2}
                y={cy * 10 + 2}
                width={6}
                height={6}
                rx={1}
                fill="#fbbf24"
                opacity={(0.05 + lit * 0.95).toFixed(2)}
              />
            );
          })}
        </svg>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className={cn("px-2")}
        onClick={() => setRunning((x) => !x)}
      >
        {running ? t("pause") : t("play")}
      </Button>
    </Card>
  );
}
