"use client";

import Link from "next/link";
import { Button, buttonClass } from "@/components/ui";

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
        The error was logged. You can try again or go back home.
      </p>
      <div className="mt-8 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link href="/home" className={buttonClass("ghost")}>
          Home
        </Link>
      </div>
    </main>
  );
}
