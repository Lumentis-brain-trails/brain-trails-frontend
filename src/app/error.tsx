"use client";

import Link from "next/link";
import { Button, buttonClass } from "@/components/ui";

/** Outside production the message is shown, so a tester can report it. */
const SHOW_DETAILS = process.env.NEXT_PUBLIC_APP_ENV !== "prod";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Kept in the browser console for whoever opens the developer tools.
  console.error(error);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="type-title">Something went wrong.</h1>
      <p className="mt-3 max-w-sm text-ink-2">
        You can try again or go back home.
      </p>
      {SHOW_DETAILS && (
        <pre className="mt-6 max-w-xl overflow-x-auto rounded-[var(--radius-control)] bg-surface-2 p-3 text-left font-mono text-[12px] whitespace-pre-wrap text-ink-2">
          {error.message}
          {error.digest ? `\n(${error.digest})` : ""}
        </pre>
      )}
      <div className="mt-8 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link href="/home" className={buttonClass("ghost")}>
          Home
        </Link>
      </div>
    </main>
  );
}
