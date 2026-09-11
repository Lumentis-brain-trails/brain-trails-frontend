import Link from "next/link";

export default function PendingPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="enter-up max-w-md">
        <span
          aria-hidden
          className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-warn-soft text-warn"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6">
            <circle
              cx="12"
              cy="12"
              r="8.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M12 8v4.5l3 1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <h1 className="type-title">Registration received.</h1>
        <p className="mt-4 text-pretty text-ink-2">
          An administrator will review it. Once approved you receive an
          email-verification link; after verifying, you can sign in.
        </p>
        <Link
          href="/login"
          className="pressable mt-8 inline-flex h-10 items-center rounded-full px-5 font-medium text-accent hover:bg-accent-soft"
        >
          Go to sign in
        </Link>
      </div>
    </main>
  );
}
