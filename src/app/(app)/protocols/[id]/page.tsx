"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useFormatLocale } from "@/i18n/formatLocale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import { useFeature } from "@/lib/features";
import { inWorkspace, useCurrentWorkspace } from "@/lib/workspace";
import {
  type ProtocolDetail,
  type ValidationResult,
  formatMinutes,
  isPlayable,
} from "@/lib/protocol/catalog";
import { useOfficialTexts } from "@/lib/protocol/official";
import { trackFeature } from "@/lib/usage";
import {
  Button,
  buttonClass,
  Card,
  ErrorBanner,
  KeyValue,
  Skeleton,
} from "@/components/ui";
import { useToast } from "@/components/Toast";

/**
 * A protocol's page (V3-0004, S16-S18): what it does, how long it takes, the blocks in
 * plain words, the content warning - then Play, which goes through consent and the
 * headband pre-flight to the run. A locked protocol is shown but cannot be played.
 * With the `console` flag, "Run with console" opens the operator console instead
 * (backend V3-0007): a fresh run key names the channel to the participant's window.
 *
 * For its author it is also where a draft is checked and published (the timeline
 * builder is S19): Publish validates and freezes the draft as the next version, and the
 * errors and warnings come back here.
 *
 * The outline names each block in plain words (`protocols.kindWords.<kind>`); a kind
 * the catalogue does not know yet is shown by its code rather than left blank.
 *
 * An official protocol's own words - title, description, warning, the outline's labels -
 * come from the catalogue in the reader's language (`lib/protocol/official.ts`); a
 * protocol somebody wrote is shown as stored.
 */
export default function ProtocolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("protocols.detail");
  const tKinds = useTranslations("protocols.kindWords");
  const locale = useFormatLocale();
  const errorMessage = useErrorMessage();
  const official = useOfficialTexts();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const consoleOn = useFeature("console");
  const item = useQuery({
    queryKey: ["protocol", id],
    queryFn: () => api.get<ProtocolDetail>(`protocols/${id}`),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["protocol", id] });
    void queryClient.invalidateQueries({ queryKey: ["protocols"] });
  };

  const check = useMutation({
    mutationFn: () =>
      api.post<ValidationResult>(`protocols/${id}/validate`, {}),
  });
  const publish = useMutation({
    mutationFn: () => api.post<ProtocolDetail>(`protocols/${id}/publish`, {}),
    onSuccess: () => {
      toast("success", t("toast.published"));
      refresh();
    },
    onError: () => check.mutate(),
  });
  // The copy goes to the library being worked in, a clinic's included; before that
  // workspace is known the API would file it in the personal one.
  const workspace = useCurrentWorkspace();
  const duplicate = useMutation({
    mutationFn: () =>
      api.post<ProtocolDetail>(
        inWorkspace(`protocols/${id}/duplicate`, workspace),
        {}
      ),
    onSuccess: (copy) => router.push(`/protocols/${copy.id}`),
  });
  const share = useMutation({
    mutationFn: () => api.post<ProtocolDetail>(`protocols/${id}/share`, {}),
    onSuccess: (p) => {
      toast(
        "success",
        p.review_state === "pending"
          ? t("toast.sentForReview")
          : t("toast.shared")
      );
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete<{ status: string }>(`protocols/${id}`),
    onSuccess: (r) => {
      toast(
        "success",
        r.status === "archived" ? t("toast.archived") : t("toast.deleted")
      );
      void queryClient.invalidateQueries({ queryKey: ["protocols"] });
      router.push("/protocols");
    },
  });

  if (item.isPending)
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Skeleton className="aspect-video w-full rounded-[var(--radius-card)]" />
        <Skeleton className="mt-4 h-7 w-1/2" />
      </main>
    );

  if (item.isError || !item.data)
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <ErrorBanner message={t("notFound")} />
        <div className="mt-6">
          <Link href="/protocols" className={buttonClass("secondary")}>
            {t("back")}
          </Link>
        </div>
      </main>
    );

  const p = official.detail(item.data);
  const locked = p.access === "locked";
  const playable = isPlayable(p);
  const draftChanged =
    p.mine &&
    p.draft !== null &&
    JSON.stringify(p.draft) !== JSON.stringify(p.definition);
  const report = check.data;
  const mutationError =
    publish.error ?? duplicate.error ?? share.error ?? remove.error;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      {p.preview_url ? (
        <video
          src={p.preview_url}
          poster={p.cover_url ?? undefined}
          muted
          loop
          autoPlay
          playsInline
          className="aspect-video w-full rounded-[var(--radius-card)] border border-hairline bg-black object-cover"
        />
      ) : p.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL
        <img
          src={p.cover_url}
          alt=""
          className="aspect-video w-full rounded-[var(--radius-card)] border border-hairline object-cover"
        />
      ) : null}

      <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="type-title">{p.title}</h1>
          <p className="type-caption mt-1 text-ink-3">
            {[
              p.visibility === "official"
                ? t("visibility.official")
                : p.visibility === "public"
                  ? t("visibility.community")
                  : t("visibility.workspace"),
              p.current_version
                ? t("version", { version: p.current_version })
                : t("draftNotPublished"),
              p.review_state === "pending" ? t("waitingForReview") : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {playable ? (
          <div className="flex flex-wrap gap-2">
            {consoleOn && (
              <Button
                variant="secondary"
                onClick={() =>
                  router.push(
                    `/console/${crypto.randomUUID()}?protocol=${encodeURIComponent(p.id)}`
                  )
                }
              >
                {t("runWithConsole")}
              </Button>
            )}
            <Link
              href={`/protocols/${p.id}/run`}
              onClick={() => trackFeature("protocol.play")}
              className={buttonClass()}
            >
              {t("play")}
            </Link>
          </div>
        ) : (
          <Button disabled title={locked ? t("lockedHint") : undefined}>
            {locked ? t("locked") : t("notPublished")}
          </Button>
        )}
      </header>

      {(p.summary || p.description) && (
        <p className="mt-4 text-pretty text-ink-2">
          {p.description ?? p.summary}
        </p>
      )}

      {p.content_warning && (
        <Card className="mt-6 border-warn/40 bg-warn-soft">
          <h2 className="text-[15px] font-semibold">{t("warning.title")}</h2>
          <p className="mt-1 text-ink-2">{p.content_warning}</p>
          <p className="type-caption mt-2 text-ink-3">{t("warning.stop")}</p>
        </Card>
      )}

      {p.outline.length > 0 && (
        <Card className="mt-6">
          <h2 className="text-[15px] font-semibold">{t("outline.title")}</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-2">
            {p.outline.map((step, i) => (
              <li key={i}>
                {step.label}
                <span className="text-ink-3">
                  {" "}
                  {t("outline.step", {
                    kind: tKinds.has(step.kind as never)
                      ? tKinds(step.kind as never)
                      : step.kind,
                    repeated: step.count > 1 ? "yes" : "no",
                    count: step.count,
                    timed: step.duration_s ? "yes" : "no",
                    duration: formatMinutes(step.duration_s) ?? "",
                  })}
                </span>
              </li>
            ))}
          </ol>
          <p className="type-caption mt-3 text-ink-3">{t("outline.note")}</p>
        </Card>
      )}

      <Card className="mt-6" inset>
        <KeyValue
          label={t("duration")}
          value={formatMinutes(p.est_duration_s) ?? "–"}
        />
        <KeyValue
          label={t("added")}
          value={new Date(p.created_at).toLocaleDateString(locale)}
        />
      </Card>

      {p.mine && (
        <Card className="mt-6 space-y-4">
          <div>
            <h2 className="text-[15px] font-semibold">{t("yours.title")}</h2>
            <p className="type-caption mt-1 text-ink-3">
              {p.current_version === null
                ? t("yours.unpublished")
                : draftChanged
                  ? t("yours.changed")
                  : t("yours.published")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/protocols/${p.id}/edit`} className={buttonClass()}>
              {t("actions.edit")}
            </Link>
            {(p.current_version === null || draftChanged) && (
              <Button
                variant="secondary"
                onClick={() => publish.mutate()}
                disabled={publish.isPending}
              >
                {t("actions.publish")}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => check.mutate()}
              disabled={check.isPending}
            >
              {t("actions.check")}
            </Button>
            {p.visibility === "workspace" &&
              p.current_version !== null &&
              p.review_state !== "pending" && (
                <Button
                  variant="secondary"
                  onClick={() => share.mutate()}
                  disabled={share.isPending}
                >
                  {t("actions.share")}
                </Button>
              )}
            <Button
              variant="ghost"
              onClick={() => {
                if (window.confirm(t("confirmDelete", { title: p.title })))
                  remove.mutate();
              }}
            >
              {t("actions.delete")}
            </Button>
          </div>
          {report && <Findings report={report} />}
        </Card>
      )}

      {!p.mine && p.current_version !== null && (
        <div className="mt-6">
          <Button
            variant="secondary"
            onClick={() => duplicate.mutate()}
            disabled={duplicate.isPending || workspace === undefined}
          >
            {t("actions.copy")}
          </Button>
        </div>
      )}

      {mutationError && (
        <div className="mt-4">
          <ErrorBanner message={errorMessage(mutationError)} />
        </div>
      )}
    </main>
  );
}

/**
 * What the check found. The findings themselves are the server's sentences
 * (`ValidationOut`), shown as they come; only the all-clear line is the app's own.
 */
function Findings({ report }: { report: ValidationResult }) {
  const t = useTranslations("protocols.detail.findings");
  if (report.ok && report.warnings.length === 0)
    return (
      <p className="type-caption text-ok">
        {t("ok", { duration: formatMinutes(report.est_duration_s) ?? "" })}
      </p>
    );
  return (
    <ul className="space-y-1 text-[14px]">
      {report.errors.map((e, i) => (
        <li key={`e${i}`} className="text-danger">
          {e.message} <span className="text-ink-3">({e.path})</span>
        </li>
      ))}
      {report.warnings.map((w, i) => (
        <li key={`w${i}`} className="text-warn">
          {w.message}
        </li>
      ))}
    </ul>
  );
}
