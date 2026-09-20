"use client";

/**
 * What happens next, which depends on what the account already is (V3-0008, amended).
 *
 * Three outcomes reach this page. `approved` is the normal one now: the account is open
 * and waiting for the address to be confirmed. `active` means the environment asks for
 * no confirmation. `pending` is the closed-beta shape, where an admin still decides.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const OUTCOMES = {
  approved: {
    title: "Check your email.",
    body:
      "We sent you a link to confirm your address. Open it and you are in - it stays " +
      "good for 24 hours. If it does not arrive, look in your spam folder.",
    tone: "accent",
  },
  active: {
    title: "Your account is open.",
    body: "Sign in with the email and password you just chose.",
    tone: "ok",
  },
  pending: {
    title: "Registration received.",
    body:
      "An administrator will review it. Once approved you can sign in with the email " +
      "and password you chose.",
    tone: "warn",
  },
} as const;

type Outcome = keyof typeof OUTCOMES;

function isOutcome(value: string | null): value is Outcome {
  return value !== null && value in OUTCOMES;
}

function Mark({ tone }: { tone: "accent" | "ok" | "warn" }) {
  const skin =
    tone === "warn"
      ? "bg-warn-soft text-warn"
      : tone === "ok"
        ? "bg-ok-soft text-ok"
        : "bg-accent-soft text-accent";
  return (
    <span
      aria-hidden
      className={`mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full ${skin}`}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6">
        {tone === "warn" ? (
          <>
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
          </>
        ) : (
          <path
            d="M3.5 7.5h17v10h-17zM3.5 7.5 12 13.5l8.5-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </span>
  );
}

function Outcome() {
  const status = useSearchParams().get("status");
  const { title, body, tone } =
    OUTCOMES[isOutcome(status) ? status : "pending"];
  return (
    <div className="enter-up max-w-md">
      <Mark tone={tone} />
      <h1 className="type-title">{title}</h1>
      <p className="mt-4 text-pretty text-ink-2">{body}</p>
      <Link
        href="/login"
        className="pressable mt-8 inline-flex h-12 items-center rounded-full bg-accent px-7 text-[16px] font-semibold text-on-accent hover:bg-accent-hover"
      >
        Go to sign in
      </Link>
    </div>
  );
}

export default function PendingPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <Suspense fallback={null}>
        <Outcome />
      </Suspense>
    </main>
  );
}
