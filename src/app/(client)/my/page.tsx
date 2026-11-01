"use client";

/**
 * The client shell's home (backend V4-0006, sprint T3): what the person was given to run,
 * as cards with Play, and the sessions they did, as a plain list.
 *
 * Nothing here says how a session went - no trail, no score, no note: that is their
 * carer's to read (decision 8 of plan V4). A card says who gave it, how long it takes,
 * by when, how many runs are left and the carer's note. A due date that has passed is
 * said kindly: the session can still be done.
 */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useFormatLocale } from "@/i18n/formatLocale";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import { formatDate } from "@/lib/format";
import { useOfficialTexts } from "@/lib/protocol/official";
import {
  type MyAssignment,
  type MySession,
  isLate,
  runsLeft,
} from "@/lib/subjects";
import {
  Card,
  EmptyState,
  ErrorBanner,
  ListRow,
  SectionTitle,
  Skeleton,
  buttonClass,
} from "@/components/ui";

export default function MyPage() {
  const t = useTranslations("my");
  const errorMessage = useErrorMessage();
  const locale = useFormatLocale();
  const official = useOfficialTexts();
  const assignments = useQuery({
    queryKey: ["me", "assignments"],
    queryFn: () => api.get<MyAssignment[]>("me/assignments"),
  });
  const sessions = useQuery({
    queryKey: ["me", "sessions"],
    queryFn: () => api.get<MySession[]>("me/sessions?limit=50"),
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="type-title">{t("title")}</h1>
      <p className="mt-2 max-w-xl text-ink-2">{t("intro")}</p>

      <div className="mt-8 space-y-4">
        {assignments.isLoading && <Skeleton className="h-40" />}
        {assignments.isError && (
          <ErrorBanner message={errorMessage(assignments.error)} />
        )}
        {assignments.isSuccess && assignments.data.length === 0 && (
          <Card>
            <EmptyState title={t("empty")} text={t("emptyText")} />
          </Card>
        )}
        {(assignments.data ?? []).map((a) => (
          <AssignmentCard key={a.id} assignment={a} />
        ))}
      </div>

      <section className="mt-12">
        <SectionTitle>{t("past")}</SectionTitle>
        <Card inset>
          {sessions.isSuccess && sessions.data.length === 0 && (
            <p className="px-5 py-4 text-ink-3">{t("pastNone")}</p>
          )}
          {(sessions.data ?? []).map((s) => (
            <ListRow key={s.id}>
              <span className="min-w-0 flex-1 truncate">
                {
                  official.card({
                    title: s.title,
                    slug: s.slug ?? "",
                    visibility: s.visibility ?? "",
                  }).title
                }
              </span>
              <span className="text-[14px] text-ink-3">
                {formatDate(s.started_at, locale)}
              </span>
              <span className="w-28 text-right text-[14px] text-ink-2">
                {t(`status.${s.status as "done"}`)}
              </span>
            </ListRow>
          ))}
        </Card>
      </section>
    </main>
  );
}

function AssignmentCard({ assignment: a }: { assignment: MyAssignment }) {
  const t = useTranslations("my");
  const locale = useFormatLocale();
  const official = useOfficialTexts();
  const shown = official.card({
    title: a.title,
    summary: a.summary,
    slug: a.slug,
    visibility: a.visibility,
  });
  const left = runsLeft(a);
  const minutes = Math.max(1, Math.round(a.est_duration_s / 60));
  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {a.cover_url && (
        // eslint-disable-next-line @next/next/no-img-element -- a presigned link, not a static asset
        <img
          src={a.cover_url}
          alt=""
          className="h-28 w-full rounded-xl object-cover sm:h-24 sm:w-36"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="type-caption text-ink-3">
          {t("from", { name: a.organisation })}
        </p>
        <h2 className="type-heading mt-0.5">{shown.title}</h2>
        {shown.summary && <p className="mt-1 text-ink-2">{shown.summary}</p>}
        <p className="mt-2 text-[14px] text-ink-3">
          {[
            t("duration", { minutes }),
            a.due_at && t("due", { date: formatDate(a.due_at, locale) }),
            left !== null && t("left", { left }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {a.due_at && isLate(a.due_at) && (
          <p className="mt-1 text-[14px] text-ink-2">{t("late")}</p>
        )}
        {a.note && (
          <p className="mt-3 rounded-xl bg-surface-2 px-4 py-3 text-[14px] text-ink-2">
            {a.note}
          </p>
        )}
        <p className="mt-2 text-[13px] text-ink-3">{t("needs")}</p>
      </div>
      <Link href={`/my/run/${a.id}`} className={buttonClass("primary", "lg")}>
        {t("play")}
      </Link>
    </Card>
  );
}
