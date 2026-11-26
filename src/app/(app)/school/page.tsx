"use client";

/**
 * A teacher's school (backend V4-0012): the class code to share, and the students who
 * signed up with it.
 *
 * The teacher sees what they need to match a student against the school's own consent
 * form - the name and year of birth the student gave, the guardian's name and
 * relationship, when each consent was ticked - and nothing of what the student records.
 * Verifying is the teacher's declaration that the guardian agreed, so it asks for that
 * sentence to be ticked; refusing takes an optional reason the student reads on their
 * waiting page.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useFormatLocale } from "@/i18n/formatLocale";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import { useGameState } from "@/lib/classgame/useClassGame";
import { useFeature } from "@/lib/features";
import { formatDate } from "@/lib/format";
import { type SchoolOut, type StudentRow, taughtSchools } from "@/lib/schools";
import { useWorkspaces } from "@/lib/workspace";
import { Sheet } from "@/components/Sheet";
import { Speakers } from "@/components/school/Speakers";
import {
  Button,
  buttonClass,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  ListRow,
  SectionTitle,
  Segmented,
  Textarea,
} from "@/components/ui";

type Tab = "pending" | "verified" | "refused";

export default function SchoolPage() {
  const t = useTranslations("schools.page");
  const enabled = useFeature("schools");
  const workspaces = useWorkspaces();
  const schools = taughtSchools(workspaces.data);

  if (!enabled || (workspaces.isSuccess && schools.length === 0)) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <EmptyState title={t("none")} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-12 px-6 py-10">
      {schools.map((school) => (
        <SchoolSection key={school.id} id={school.id} />
      ))}
    </main>
  );
}

function SchoolSection({ id }: { id: string }) {
  const t = useTranslations("schools.page");
  const tg = useTranslations("classGame.host");
  const games = useFeature("class_games");
  // a game left running while the teacher went elsewhere: the button resumes it
  const gameState = useGameState(id, games);
  const multi = useFeature("workspaces_multi");
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("pending");
  const [confirmNew, setConfirmNew] = useState(false);

  const school = useQuery({
    queryKey: ["school", id],
    queryFn: () => api.get<SchoolOut>(`schools/${id}`),
  });
  const students = useQuery({
    queryKey: ["school", id, "students", tab],
    queryFn: () =>
      api.get<StudentRow[]>(`schools/${id}/students?status=${tab}`),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["school", id] });

  const regenerate = useMutation({
    mutationFn: () => api.post<SchoolOut>(`schools/${id}/code`),
    onSuccess: () => {
      setConfirmNew(false);
      refresh();
    },
  });

  const data = school.data;

  return (
    <section>
      <header className="mb-6">
        <h1 className="type-title">{data?.name ?? t("title")}</h1>
        {data && (
          <p className="mt-2 text-ink-2">
            {t("where", { city: data.city, country: data.country })}
          </p>
        )}
        <p className="mt-2 text-pretty text-ink-3">{t("intro")}</p>
        {games && (
          <Link
            href={`/school/game/${id}`}
            className={buttonClass("primary", "sm", "mt-4")}
          >
            {gameState.data?.open ? tg("resume") : tg("open")}
          </Link>
        )}
      </header>
      {school.isError && <ErrorBanner message={errorMessage(school.error)} />}

      {data && (
        <Card>
          <p className="text-[13px] font-medium text-ink-2">{t("code")}</p>
          <p className="font-display mt-1 text-[32px] tracking-[0.12em] select-all">
            {data.class_code ?? "-"}
          </p>
          <p className="mt-2 text-pretty text-[14px] text-ink-3">
            {t("codeHint")}
          </p>
          <div className="mt-4">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setConfirmNew(true)}
            >
              {t("regenerate")}
            </Button>
          </div>
        </Card>
      )}

      <div className="mt-10 mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionTitle className="mb-0">{t("students")}</SectionTitle>
        <Segmented
          label={t("students")}
          value={tab}
          onChange={setTab}
          options={(["pending", "verified", "refused"] as const).map((v) => ({
            value: v,
            label: t(`tabs.${v}`, { count: data?.[v] ?? 0 }),
          }))}
        />
      </div>
      {students.isError && (
        <ErrorBanner message={errorMessage(students.error)} />
      )}
      {students.data && students.data.length === 0 && (
        <EmptyState title={t(`empty.${tab}`)} />
      )}
      {students.data && students.data.length > 0 && (
        <Card inset>
          {students.data.map((row) => (
            <StudentLine
              key={row.user_id}
              schoolId={id}
              row={row}
              onDone={refresh}
            />
          ))}
        </Card>
      )}

      {confirmNew && (
        <Sheet title={t("regenerate")} onClose={() => setConfirmNew(false)}>
          <div className="space-y-4">
            <p className="text-pretty text-ink-2">{t("regenerateText")}</p>
            {regenerate.isError && (
              <ErrorBanner message={errorMessage(regenerate.error)} />
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmNew(false)}>
                {t("cancel")}
              </Button>
              <Button
                disabled={regenerate.isPending}
                onClick={() => regenerate.mutate()}
              >
                {t("regenerateConfirm")}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
      {multi && <Speakers school={id} />}
    </section>
  );
}

function StudentLine({
  schoolId,
  row,
  onDone,
}: {
  schoolId: string;
  row: StudentRow;
  onDone: () => void;
}) {
  const t = useTranslations("schools.page");
  const tRel = useTranslations("schools.relationships");
  const locale = useFormatLocale();
  const errorMessage = useErrorMessage();
  const [acting, setActing] = useState<"verify" | "refuse" | null>(null);
  const [checked, setChecked] = useState(false);
  const [reason, setReason] = useState("");

  const decide = useMutation({
    mutationFn: (verb: "verify" | "refuse") =>
      api.post<StudentRow>(
        `schools/${schoolId}/students/${row.user_id}/${verb}`,
        verb === "verify"
          ? { guardian_agreed: checked }
          : { reason: reason.trim() || null }
      ),
    onSuccess: () => {
      setActing(null);
      onDone();
    },
  });

  return (
    <ListRow>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{row.student_name}</span>
        <span className="block text-[13px] text-ink-3">
          {t("born", { year: row.birth_year })}
          {row.minor && ` · ${t("minor")}`}
        </span>
        {row.guardian_name && (
          <span className="block text-[13px] text-ink-2">
            {t("guardian", {
              name: row.guardian_name,
              relationship: tRel(
                (row.guardian_relationship ?? "parent") as
                  "parent" | "legal_guardian"
              ),
            })}
          </span>
        )}
        <span className="block text-[13px] text-ink-3">
          {row.guardian_consent_at
            ? t("consents", {
                student: formatDate(row.student_consent_at, locale),
                guardian: formatDate(row.guardian_consent_at, locale),
              })
            : t("ownConsent", {
                date: formatDate(row.student_consent_at, locale),
              })}
        </span>
        {row.refusal_reason && (
          <span className="block text-[13px] text-ink-3">
            {t("reasonGiven", { reason: row.refusal_reason })}
          </span>
        )}
      </span>
      {row.status === "pending" && (
        <span className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setActing("refuse")}
          >
            {t("refuse")}
          </Button>
          <Button size="sm" onClick={() => setActing("verify")}>
            {t("verify")}
          </Button>
        </span>
      )}

      {acting && (
        <Sheet
          title={t(acting === "verify" ? "verifyTitle" : "refuseTitle", {
            name: row.student_name,
          })}
          onClose={() => setActing(null)}
        >
          <div className="space-y-4">
            {decide.isError && (
              <ErrorBanner message={errorMessage(decide.error)} />
            )}
            {acting === "verify" ? (
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
                />
                <span>{t("verifyTick")}</span>
              </label>
            ) : (
              <Field label={t("reason")} hint={t("reasonHint")}>
                <Textarea
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setActing(null)}>
                {t("cancel")}
              </Button>
              <Button
                variant={acting === "refuse" ? "danger" : "primary"}
                disabled={decide.isPending || (acting === "verify" && !checked)}
                onClick={() => decide.mutate(acting)}
              >
                {t(acting === "verify" ? "verify" : "refuse")}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </ListRow>
  );
}
