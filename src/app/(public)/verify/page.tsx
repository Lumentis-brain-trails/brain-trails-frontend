"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ApiRequestError, api } from "@/lib/api";
import { Card, ErrorBanner } from "@/components/ui";

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
    <Card className="max-w-md text-center">
      {state === "working" && <p>Verifying your email...</p>}
      {state === "ok" && (
        <>
          <h1 className="mb-2 text-xl font-semibold">Email verified</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Your account is active.{" "}
            <Link href="/login" className="text-indigo-600 hover:underline">
              Sign in
            </Link>
          </p>
        </>
      )}
      {state === "error" && <ErrorBanner message={message} />}
    </Card>
  );
}

export default function VerifyPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <VerifyContent />
      </Suspense>
    </main>
  );
}
