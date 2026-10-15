"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import { ErrorBanner, Spinner } from "@/components/ui";

/** The one failure that is not a thrown error: the link carried no token at all. */
const MISSING_TOKEN = Symbol("missing-token");

function VerifyContent() {
  const params = useSearchParams();
  const token = params.get("token");
  const t = useTranslations("public.verify");
  const errorMessage = useErrorMessage();
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  // What went wrong, kept as the fact and put into words at render: a link with no
  // token in it, or whatever the call threw.
  const [failure, setFailure] = useState<unknown>(null);
  const started = useRef(false);

  useEffect(() => {
    // The token is single-use: guard against React StrictMode double-invocation.
    if (started.current) return;
    started.current = true;
    if (!token) {
      queueMicrotask(() => {
        setState("error");
        setFailure(MISSING_TOKEN);
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
        setFailure(e);
      });
  }, [token]);

  return (
    <div className="enter-up max-w-md text-center">
      {state === "working" && (
        <p className="flex items-center justify-center gap-2 text-ink-2">
          <Spinner /> {t("working")}
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
          <h1 className="type-title">{t("title")}</h1>
          <p className="mt-4 text-ink-2">{t("text")}</p>
          <Link
            href="/login"
            className="pressable mt-8 inline-flex h-12 items-center rounded-full bg-accent px-7 text-[16px] font-semibold text-on-accent hover:bg-accent-hover"
          >
            {t("signIn")}
          </Link>
        </>
      )}
      {state === "error" && (
        <ErrorBanner
          message={
            failure === MISSING_TOKEN
              ? t("missingToken")
              : errorMessage(failure)
          }
        />
      )}
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
