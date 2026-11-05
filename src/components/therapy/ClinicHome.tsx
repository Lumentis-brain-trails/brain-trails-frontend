"use client";

/**
 * The clinic home (backend T6): a therapist's day in three lists - their patients, what
 * is assigned and due, and the sessions waiting for them to read. "Waiting for review"
 * empties itself: opening a recording is what takes it off (the read audit of T3).
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card, ListRow, SectionTitle, Skeleton } from "@/components/ui";
import { useFormatLocale } from "@/i18n/formatLocale";
import { api } from "@/lib/api";
import type { Assignment, Subject } from "@/lib/subjects";
import { useReviewQueue } from "@/lib/therapy";
import type { Workspace } from "@/lib/workspace";

const DAY_MS = 24 * 60 * 60 * 1000;

export function ClinicHome({ workspace }: { workspace: Workspace }) {
  const t = useTranslations("therapy.home");
  const locale = useFormatLocale();
  const patients = useQuery({
    queryKey: ["subjects", workspace.id, "home"],
    queryFn: () =>
      api.get<Subject[]>(`workspaces/${workspace.id}/subjects?limit=100`),
  });
  const assignments = useQuery({
    queryKey: ["assignments", workspace.id, "home"],
    queryFn: () =>
      api.get<Assignment[]>(
        `workspaces/${workspace.id}/assignments?open=true&limit=100`
      ),
  });
  const review = useReviewQueue(workspace.id);
  const mine = (patients.data ?? []).filter(
    (p) => p.readable && p.archived_at == null && p.carers.some((c) => c.you)
  );
  // due before the end of today, overdue first; "now" is fixed when the page opens
  const [{ now, endOfToday }] = useState(() => ({
    now: Date.now(),
    endOfToday: new Date().setHours(23, 59, 59, 999),
  }));
  const due = (assignments.data ?? [])
    .filter((a) => a.due_at && +new Date(a.due_at) <= endOfToday)
    .sort((a, b) => +new Date(a.due_at ?? 0) - +new Date(b.due_at ?? 0));
  const name = (p: { display_name?: string | null; code: string }) =>
    p.display_name || p.code;

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <section aria-label={t("review")} className="lg:col-span-2">
        <SectionTitle>{t("review")}</SectionTitle>
        <Card inset>
          {review.isLoading && <Skeleton className="m-4 h-16" />}
          {review.isSuccess && review.data.length === 0 && (
            <p className="px-5 py-4 text-ink-3">{t("reviewNone")}</p>
          )}
          {(review.data ?? []).map((r) => (
            <Link
              key={r.session_id}
              href={`/recordings/${r.recording_id}`}
              className="pressable flex items-center gap-3 border-b border-hairline px-5 py-3.5 last:border-b-0 hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {name({ display_name: r.display_name, code: r.subject_code })}
                </span>
                <span className="block text-[13px] text-ink-3">
                  {r.title} ·{" "}
                  {new Date(r.started_at).toLocaleDateString(locale)}
                </span>
              </span>
            </Link>
          ))}
        </Card>
      </section>

      <div>
        <section aria-label={t("today")}>
          <SectionTitle>{t("today")}</SectionTitle>
          <Card inset>
            {assignments.isSuccess && due.length === 0 && (
              <p className="px-5 py-4 text-ink-3">{t("todayNone")}</p>
            )}
            {due.map((a) => (
              <ListRow key={a.id}>
                <Link
                  href={`/patients/${a.subject_id}`}
                  className="min-w-0 flex-1 truncate font-medium hover:underline"
                >
                  {a.subject_code}
                </Link>
                <span className="truncate text-[13px] text-ink-3">
                  {a.protocol_title}
                  {a.due_at && +new Date(a.due_at) < now - DAY_MS / 2
                    ? ` · ${t("late")}`
                    : ""}
                </span>
              </ListRow>
            ))}
          </Card>
        </section>
        <section aria-label={t("patients")} className="mt-8">
          <SectionTitle>{t("patients")}</SectionTitle>
          <Card inset>
            {patients.isSuccess && mine.length === 0 && (
              <p className="px-5 py-4 text-ink-3">{t("patientsNone")}</p>
            )}
            {mine.map((p) => (
              <Link
                key={p.id}
                href={`/patients/${p.id}`}
                className="pressable flex items-center gap-3 border-b border-hairline px-5 py-3 last:border-b-0 hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {name(p)}
                </span>
                <span className="text-[13px] text-ink-3">
                  {p.last_session_at
                    ? new Date(p.last_session_at).toLocaleDateString(locale)
                    : t("never")}
                </span>
              </Link>
            ))}
          </Card>
        </section>
      </div>
    </div>
  );
}
