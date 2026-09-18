"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ApiRequestError, api } from "@/lib/api";
import { ErrorBanner, Spinner } from "@/components/ui";

function VerifyContent() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("");
  const started = useRef(false);

  useEffect(() => {
    // The token is single-use: guard against React StrictMode double-invocation.
    if (started.current) return;
    started.current = true;
    if (!token) {
      queueMicrotask(() => {
        setState("error");
        setMessage("Missing verification token.");
      });
      return;
    }
    api
      .get<{ status: string }>(
        `auth/verify-email?token=${encodeURIComponent(token)}`
      )
      .then(() => setState("ok"))
      .catch((e) => {
        setState("error");
        setMessage(
          e instanceof ApiRequestError ? e.error.message : "Network error."
        );
      });
  }, [token]);

  return (
    <div className="enter-up max-w-md text-center">
      {state === "working" && (
        <p className="flex items-center justify-center gap-2 text-ink-2">
          <Spinner /> Verifying your email…
        </p>
      )}
      {state === "ok" && (
        <>
          <span
            aria-hidden
            className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-ok-soft text-ok"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6">
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <h1 className="type-title">Email verified.</h1>
          <p className="mt-4 text-ink-2">Your account is active.</p>
          <Link
            href="/login"
            className="pressable mt-8 inline-flex h-12 items-center rounded-full bg-accent px-7 text-[17px] font-medium text-on-accent hover:bg-accent-hover"
          >
            Sign in
          </Link>
        </>
      )}
      {state === "error" && <ErrorBanner message={message} />}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <Suspense>
        <VerifyContent />
      </Suspense>
    </main>
  );
}
