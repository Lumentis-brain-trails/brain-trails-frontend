"use client";

/**
 * Where another environment sends an admin with a transfer link (backend `app.transfers`).
 *
 * The link arrives in the URL fragment (`#t=`), so it never reached this site's server.
 * It is read once and wiped from the address bar. One button redeems it: the backend
 * fetches the manifest from the source, answers with how many recordings it found, and
 * copies them in the background. They appear in Recordings and are processed here.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Suspense, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import { envKey, tokenFromHash, type TransferImport } from "@/lib/transfers";
import { Button, Card, ErrorBanner } from "@/components/ui";

let captured: string | null = null;

/** The link in this page's fragment, read once; the fragment is then removed. */
function captureToken(): string {
  if (captured === null) {
    captured = tokenFromHash(window.location.hash);
    if (captured) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    }
  }
  return captured;
}

function noSubscription(): () => void {
  return () => {};
}

function ImportTransfer() {
  const t = useTranslations("transfers");
  const errorMessage = useErrorMessage();
  const source = useSearchParams().get("from") ?? "";
  // The fragment exists only in the browser: the server renders `null`, the client the
  // link, read once and then wiped from the address bar.
  const token = useSyncExternalStore(noSubscription, captureToken, () => null);
  const run = useMutation({
    mutationFn: () =>
      api.post<TransferImport>("transfers/imports", {
        source,
        token: token ?? "",
      }),
  });
  const sourceName = t(`env.${envKey(source)}`);

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <h1 className="type-title mb-6">{t("importTitle")}</h1>
      <Card>
        {token === null ? null : !token || !source ? (
          <p className="text-ink-2">{t("noLink")}</p>
        ) : run.data ? (
          <div className="space-y-4">
            <p className="text-ink-2">
              {t("result", {
                found: run.data.found,
                queued: run.data.queued,
                here: run.data.already_here,
              })}
            </p>
            <Link href="/recordings" className="text-accent">
              {t("openRecordings")}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-ink-2">{t("importText", { env: sourceName })}</p>
            {run.error && <ErrorBanner message={errorMessage(run.error)} />}
            <div className="flex justify-end">
              <Button disabled={run.isPending} onClick={() => run.mutate()}>
                {run.isPending ? t("importing") : t("import")}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </main>
  );
}

export default function ImportTransferPage() {
  return (
    <Suspense>
      <ImportTransfer />
    </Suspense>
  );
}
