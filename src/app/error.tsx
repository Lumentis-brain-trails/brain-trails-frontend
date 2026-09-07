"use client";

import { Button, Card } from "@/components/ui";

export default function GlobalError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md text-center">
        <h1 className="mb-2 text-xl font-semibold">Something went wrong</h1>
        <p className="mb-4 text-sm text-neutral-500">
          The error was logged. You can retry, or go back to your recordings.
        </p>
        <Button onClick={reset}>Try again</Button>
      </Card>
    </main>
  );
}
