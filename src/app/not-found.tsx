import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="type-eyebrow text-ink-3">404</p>
      <h1 className="type-title mt-3">This page does not exist.</h1>
      <Link
        href="/recordings"
        className="pressable mt-8 inline-flex h-10 items-center rounded-full px-5 font-medium text-accent hover:bg-accent-soft"
      >
        Back to recordings
      </Link>
    </main>
  );
}
