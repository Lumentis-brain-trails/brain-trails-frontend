"use client";

import Link from "next/link";
import { Button } from "@/components/ui";

export default function GlobalError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="type-title">Something went wrong.</h1>
      <p className="mt-3 max-w-sm text-ink-2">
        The error was logged. You can try again or go back to your recordings.
      </p>
      <div className="mt-8 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link
          href="/recordings"
          className="pressable inline-flex h-10 items-center rounded-full px-5 font-medium text-accent hover:bg-accent-soft"
        >
          Recordings
        </Link>
      </div>
    </main>
  );
}
