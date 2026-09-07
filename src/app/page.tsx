import Link from "next/link";
import { Logo } from "@/components/Logo";

const version = (process.env.NEXT_PUBLIC_GIT_SHA ?? "dev").slice(0, 7);

const FEATURES = [
  {
    title: "Upload your session",
    text: "Mind Monitor CSV or EDF files from your Muse headband, straight to secure storage.",
  },
  {
    title: "A foundation model reads it",
    text: "Each 4-second window becomes an embedding through REVE, trained on 60,000 hours of EEG.",
  },
  {
    title: "See the trail",
    text: "A per-session projection turns your recording into a path through brain-state space.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-white dark:from-neutral-950 dark:via-neutral-950 dark:to-neutral-900">
      <div className="mx-auto flex max-w-5xl flex-col items-center px-6 pb-16 pt-24 text-center">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={44} />
          <span className="text-2xl font-bold tracking-tight">
            Brain Trails
          </span>
        </div>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Watch where your brain travelled.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-neutral-500">
          Turn a raw EEG recording into a readable trail through embedding space
          - cleaned, embedded and projected automatically.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-lg border border-neutral-300 bg-white px-6 py-3 text-sm font-semibold transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
          >
            Create an account
          </Link>
        </div>
        <p className="mt-3 text-xs text-neutral-400">
          Registrations are reviewed by an administrator before activation.
        </p>

        <div className="mt-20 grid w-full gap-6 text-left sm:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                {i + 1}
              </div>
              <h3 className="mb-1 font-semibold">{f.title}</h3>
              <p className="text-sm text-neutral-500">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
      <footer className="border-t border-neutral-200 py-6 text-center text-xs text-neutral-400 dark:border-neutral-800">
        a LuMentis prototype · v{version} ·{" "}
        <Link href="/privacy" className="hover:underline">
          privacy
        </Link>
      </footer>
    </main>
  );
}
