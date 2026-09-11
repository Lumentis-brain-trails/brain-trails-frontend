import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { TrailIllustration } from "@/components/TrailIllustration";

const version = (process.env.NEXT_PUBLIC_GIT_SHA ?? "dev").slice(0, 7);

const STEPS = [
  {
    title: "Record.",
    text: "A Muse 2 headband and a Mind Monitor export. Soon, straight from the browser.",
  },
  {
    title: "Embed.",
    text: "Every four seconds of signal becomes a point, read by a foundation model trained on sixty thousand hours of EEG.",
  },
  {
    title: "Follow the trail.",
    text: "The points form a path. Where it lingers, where it turns and where it settles is the story of the session.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Wordmark size={16} />
        <nav className="flex items-center gap-1">
          <Link
            href="/login"
            className="pressable rounded-full px-4 py-2 text-[14px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="pressable rounded-full bg-ink px-4 py-2 text-[14px] font-medium text-canvas hover:opacity-90"
          >
            Create an account
          </Link>
        </nav>
      </header>

      <section className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-24 pb-16 text-center sm:pt-32">
        <p className="type-eyebrow enter-up text-ink-3">EEG, as a path</p>
        <h1 className="type-display enter-up mt-4 max-w-2xl text-balance [animation-delay:60ms]">
          Watch where your brain travelled.
        </h1>
        <p className="type-body-lg enter-up mt-6 max-w-xl text-pretty text-ink-2 [animation-delay:120ms]">
          Brain Trails turns a raw EEG recording into a single readable line
          through brain-state space. Cleaned, embedded and projected. Nothing to
          configure.
        </p>
        <div className="enter-up mt-10 flex flex-wrap items-center justify-center gap-3 [animation-delay:180ms]">
          <Link
            href="/register"
            className="pressable inline-flex h-12 items-center rounded-full bg-accent px-7 text-[17px] font-medium text-on-accent hover:bg-accent-hover"
          >
            Create an account
          </Link>
          <Link
            href="/login"
            className="pressable inline-flex h-12 items-center gap-1 rounded-full px-5 text-[17px] font-medium text-accent hover:bg-accent-soft"
          >
            Sign in
          </Link>
        </div>
        <p className="type-caption mt-4 text-ink-3">
          Registrations are reviewed by an administrator before activation.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6">
        <div className="enter-up rounded-[28px] border border-hairline bg-surface p-4 shadow-(--shadow-card) [animation-delay:240ms] sm:p-8">
          <TrailIllustration className="h-auto w-full" />
          <div className="mt-2 flex items-center justify-between px-2">
            <span className="type-caption text-ink-3">
              Rest, eyes closed · 3 min
            </span>
            <span className="type-caption text-ink-3">
              PC1 · PC2 of a per-session projection
            </span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-24 sm:py-32">
        <h2 className="type-title max-w-xl text-balance">
          Three steps. One line.
        </h2>
        <div className="stagger mt-12 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-hairline sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.title} className="bg-surface p-8">
              <h3 className="type-heading">{s.title}</h3>
              <p className="mt-3 text-pretty text-ink-2">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-hairline bg-surface">
        <div className="mx-auto grid max-w-5xl gap-10 px-6 py-20 sm:grid-cols-2 sm:items-center">
          <div>
            <h2 className="type-title text-balance">
              Built for research. Yours to delete.
            </h2>
            <p className="type-body-lg mt-5 text-pretty text-ink-2">
              A free, non-commercial, non-clinical prototype by LuMentis. Your
              recordings stay in the EU and are visible only to you. Export
              everything or erase your account in one step, whenever you like.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-6">
            {[
              ["4", "channels, 256 Hz"],
              ["4 s", "per embedding"],
              ["512", "dimensions, projected to 2"],
              ["EU", "storage, Frankfurt"],
            ].map(([v, l]) => (
              <div key={l} className="border-t border-hairline pt-4">
                <dt className="text-[32px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
                  {v}
                </dt>
                <dd className="mt-2 text-ink-2">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-8">
        <span className="type-caption text-ink-3">
          A LuMentis prototype · v{version}
        </span>
        <Link
          href="/privacy"
          className="type-caption text-ink-3 hover:text-ink"
        >
          privacy
        </Link>
      </footer>
    </main>
  );
}
