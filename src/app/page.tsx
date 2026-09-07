import Link from "next/link";
import { Card } from "@/components/ui";

const version = process.env.NEXT_PUBLIC_GIT_SHA ?? "dev";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-4">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">Brain Trails</h1>
        <p className="mt-3 max-w-md text-neutral-500">
          Upload an EEG recording from your Muse headband and watch the trail
          your brain traveled through embedding space.
        </p>
      </div>
      <Card className="w-full max-w-sm space-y-3 text-center">
        <Link
          href="/login"
          className="block w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="block w-full rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Create an account
        </Link>
        <p className="text-xs text-neutral-400">
          Registrations are reviewed by an administrator before activation.
        </p>
      </Card>
      <p className="text-xs text-neutral-400" data-testid="version">
        a LuMentis prototype · {version.slice(0, 7)}
      </p>
    </main>
  );
}
