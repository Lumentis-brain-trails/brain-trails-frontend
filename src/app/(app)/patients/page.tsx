"use client";

/**
 * The people an organisation records (backend V4 sprint T3): patients in a clinic,
 * participants in a laboratory - one page, the words chosen by edition.
 *
 * A carer sees the people they care for, in full. An owner or admin also sees the
 * **roster**: every subject's code, carers, counts and dates, and nothing about the
 * person (`readable: false`), which is what managing seats and handing someone over
 * needs (V4-0001). A subject nobody cares for any more is flagged for hand-over. A member
 * who is neither sees no one: the backend never lists them.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFormatLocale } from "@/i18n/formatLocale";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import { useFeature } from "@/lib/features";
import { formatDate } from "@/lib/format";
import {
  type Subject,
  type SubjectIn,
  subjectLabel,
  subjectWords,
  useSubjects,
} from "@/lib/subjects";
import {
  editionOf,
  managesMembers,
  useCurrentWorkspace,
} from "@/lib/workspace";
import { Sheet } from "@/components/Sheet";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Icon,
  Input,
  Segmented,
  Skeleton,
} from "@/components/ui";
import {
  SubjectFields,
  type SubjectForm,
  emptyForm,
  toBody,
} from "@/components/subjects/SubjectFields";

export default function SubjectsPage() {
  const t = useTranslations("subjects");
  const tPeople = useTranslations("people");
  const errorMessage = useErrorMessage();
  const workspace = useCurrentWorkspace();
  const multi = useFeature("workspaces_multi");
  const organisation =
    multi && workspace !== undefined && workspace.kind !== "personal";
  const manager = managesMembers(workspace);
  const words = subjectWords(editionOf(workspace?.kind));
  const [view, setView] = useState<"mine" | "all">("all");
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const list = useSubjects(workspace?.id, {
    view: manager ? view : "mine",
    q,
    archived,
    enabled: organisation,
  });

  if (!workspace) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Skeleton className="h-40" />
      </main>
    );
  }
  if (!organisation) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <EmptyState
          title={tPeople("personal.title")}
          text={tPeople("personal.text")}
        />
      </main>
    );
  }

  const rows = list.data ?? [];
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="type-title">{t(`${words}.title`)}</h1>
          <p className="mt-2 max-w-xl text-ink-2">{t(`${words}.intro`)}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Icon name="plus" /> {t(`${words}.new`)}
        </Button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          aria-label={t("search")}
          placeholder={t("search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        {manager && (
          <Segmented
            label={t("view.label")}
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: t("view.all") },
              { value: "mine", label: t("view.mine") },
            ]}
          />
        )}
        <label className="flex cursor-pointer items-center gap-2 text-[14px] text-ink-2">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
            className="h-4 w-4 rounded accent-(--accent)"
          />
          {t("showArchived")}
        </label>
      </div>

      {list.isError && <ErrorBanner message={errorMessage(list.error)} />}
      <Card inset>
        {list.isLoading && <Skeleton className="m-5 h-16" />}
        {list.isSuccess && rows.length === 0 && (
          <EmptyState
            title={t(`${words}.empty`)}
            text={t(`${words}.emptyText`)}
          />
        )}
        {rows.map((s) => (
          <SubjectRow key={s.id} subject={s} />
        ))}
      </Card>

      {creating && (
        <NewSubject
          workspaceId={workspace.id}
          lab={workspace.kind === "lab"}
          title={t(`${words}.new`)}
          onClose={() => setCreating(false)}
        />
      )}
    </main>
  );
}

function SubjectRow({ subject: s }: { subject: Subject }) {
  const t = useTranslations("subjects");
  const locale = useFormatLocale();
  const badges = [
    s.no_carer && t("noCarer"),
    s.readable && s.consent_at == null && t("noConsent"),
    s.has_account && t("hasAccount"),
    s.archived_at != null && t("archivedBadge"),
  ].filter(Boolean) as string[];
  return (
    <Link
      href={`/patients/${s.id}`}
      className="pressable flex items-center gap-4 border-b border-hairline px-5 py-3.5 last:border-b-0 hover:bg-surface-2"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {subjectLabel(s)}
          {s.display_name && (
            <span className="ml-2 text-[13px] font-normal text-ink-3">
              {s.code}
            </span>
          )}
        </span>
        <span className="block text-[13px] text-ink-3">
          {[
            t("sessions", { count: s.sessions }),
            s.last_session_at &&
              t("lastSession", { date: formatDate(s.last_session_at, locale) }),
            t("openAssignments", { count: s.open_assignments }),
            s.carers.length > 0 &&
              t("carersList", {
                names: s.carers.map((c) => c.email).join(", "),
              }),
            !s.readable && t("rosterRow"),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      {badges.map((b) => (
        <span
          key={b}
          className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] whitespace-nowrap text-ink-2"
        >
          {b}
        </span>
      ))}
      <Icon name="chevron" className="text-ink-3" />
    </Link>
  );
}

function NewSubject({
  workspaceId,
  lab,
  title,
  onClose,
}: {
  workspaceId: string;
  lab: boolean;
  title: string;
  onClose: () => void;
}) {
  const t = useTranslations("subjects.form");
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SubjectForm>(emptyForm);
  const create = useMutation({
    mutationFn: () =>
      api.post<Subject>(
        `workspaces/${workspaceId}/subjects`,
        toBody(form, { lab }) satisfies SubjectIn
      ),
    onSuccess: (made) => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      router.push(`/patients/${made.id}`);
    },
  });
  return (
    <Sheet title={title} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        {create.isError && <ErrorBanner message={errorMessage(create.error)} />}
        <SubjectFields form={form} onChange={setForm} lab={lab} creating />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {t("create")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
