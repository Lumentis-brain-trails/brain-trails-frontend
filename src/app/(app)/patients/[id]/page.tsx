"use client";

/**
 * One patient or participant (backend V4 sprint T3): their file, their care team, what
 * they were given to run, their sessions, and their own account.
 *
 * What shows follows what the API returned. A carer reads the whole file. An owner or
 * admin who is not a carer gets the roster row - code, carers, dates - and the care team
 * to manage, which is how a person left with no carer is handed over; adding themself is
 * allowed and is recorded (V4-0001: there is no silent access). Every change of the care
 * team is an audit row on the backend; reading a session here is one too.
 *
 * Assignments and the invitation sit behind the `assignments` flag.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { use, useState } from "react";
import { useFormatLocale } from "@/i18n/formatLocale";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { useErrorMessage } from "@/lib/errorMessage";
import { useFeature } from "@/lib/features";
import { formatDate } from "@/lib/format";
import { type ProtocolCard, isPlayable } from "@/lib/protocol/catalog";
import type { StimulusSession } from "@/lib/protocol/session";
import { useOfficialTexts } from "@/lib/protocol/official";
import {
  type Assignment,
  type Carer,
  type Subject,
  isLate,
  subjectLabel,
  subjectWords,
} from "@/lib/subjects";
import { editionOf, managesMembers, useWorkspaces } from "@/lib/workspace";
import { Sheet } from "@/components/Sheet";
import { AssignDialog } from "@/components/subjects/AssignDialog";
import {
  SubjectFields,
  type SubjectForm,
  toBody,
} from "@/components/subjects/SubjectFields";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Icon,
  Input,
  ListRow,
  SectionTitle,
  Select,
  Skeleton,
  buttonClass,
} from "@/components/ui";

type Member = components["schemas"]["MemberOut"];
type Invited = components["schemas"]["ClientInvitationOut"];

export default function SubjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("subjects");
  const errorMessage = useErrorMessage();
  const locale = useFormatLocale();
  const subject = useQuery({
    queryKey: ["subjects", "one", id],
    queryFn: () => api.get<Subject>(`subjects/${id}`),
    retry: false,
  });
  const workspaces = useWorkspaces();
  const workspace = (workspaces.data ?? []).find(
    (w) => w.id === subject.data?.workspace_id
  );
  const words = subjectWords(editionOf(workspace?.kind));
  const assignmentsOn = useFeature("assignments");

  if (subject.isLoading)
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Skeleton className="h-40" />
      </main>
    );
  if (subject.isError || !subject.data)
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <ErrorBanner message={errorMessage(subject.error)} />
      </main>
    );
  const s = subject.data;
  const manager = managesMembers(workspace);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/patients"
        className="pressable inline-flex items-center gap-1 text-[14px] text-ink-2 hover:text-ink"
      >
        <Icon name="back" /> {t(`${words}.title`)}
      </Link>
      <header className="mt-4 mb-8">
        <p className="type-caption text-ink-3">{t(`${words}.one`)}</p>
        <h1 className="type-title">{subjectLabel(s)}</h1>
        <p className="mt-1 text-ink-2">
          {[
            s.display_name ? t("page.code", { code: s.code }) : null,
            t("page.since", { date: formatDate(s.created_at, locale) }),
            s.archived_at ? t("archivedBadge") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <div className="space-y-10">
        {s.no_carer && (
          <Notice title={t("page.noCarerTitle")} text={t("page.noCarerText")} />
        )}
        {!s.readable && (
          <Notice title={t("page.rosterTitle")} text={t("page.rosterText")} />
        )}
        {s.readable && <Details subject={s} lab={workspace?.kind === "lab"} />}
        {workspace?.kind !== "lab" && (
          <CareTeam subject={s} manager={manager} />
        )}
        {s.readable && assignmentsOn && <Assignments subject={s} />}
        {s.readable && assignmentsOn && <Invite subject={s} />}
        {s.readable && <Sessions subject={s} />}
        {s.readable && <ArchiveButton subject={s} />}
      </div>
    </main>
  );
}

/** The remote console's two flags (T5): the room and the service it runs on. */
function useRemoteConsole(): boolean {
  const remote = useFeature("console_remote");
  const live = useFeature("live");
  return remote && live;
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <Card className="bg-surface-2">
      <h2 className="type-subhead">{title}</h2>
      <p className="mt-1 text-[14px] text-ink-2">{text}</p>
    </Card>
  );
}

function useRefresh(id: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["subjects"] });
    queryClient.invalidateQueries({ queryKey: ["assignments"] });
    queryClient.invalidateQueries({ queryKey: ["subject-sessions", id] });
  };
}

function Details({ subject: s, lab }: { subject: Subject; lab: boolean }) {
  const t = useTranslations("subjects");
  const tForm = useTranslations("subjects.form");
  const locale = useFormatLocale();
  const errorMessage = useErrorMessage();
  const refresh = useRefresh(s.id);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<SubjectForm | null>(null);
  const save = useMutation({
    mutationFn: (body: object) => api.patch<Subject>(`subjects/${s.id}`, body),
    onSuccess: () => {
      refresh();
      setEditing(false);
    },
  });
  const open = () => {
    setForm({
      code: s.code,
      displayName: s.display_name ?? "",
      birthYear: s.birth_year ? String(s.birth_year) : "",
      sex: s.sex_at_birth ?? "",
      handedness: s.handedness ?? "",
      language: (s.language as "en" | "it") ?? "en",
      consent: false,
      consentVersion: "",
    });
    setEditing(true);
  };
  const facts = [
    s.birth_year ? `${tForm("birthYear")}: ${s.birth_year}` : null,
    s.sex_at_birth
      ? `${tForm("sex")}: ${tForm(`sexes.${s.sex_at_birth as "female"}`)}`
      : null,
    s.handedness
      ? `${tForm("handedness")}: ${tForm(`hands.${s.handedness as "right"}`)}`
      : null,
  ].filter(Boolean);
  return (
    <section>
      <SectionTitle
        action={
          <Button variant="ghost" size="sm" onClick={open}>
            {t("page.edit")}
          </Button>
        }
      >
        {t("page.details")}
      </SectionTitle>
      <Card>
        {facts.length > 0 && <p className="text-ink-2">{facts.join(" · ")}</p>}
        <p className={facts.length > 0 ? "mt-2 text-[14px]" : "text-[14px]"}>
          {s.consent_at ? (
            <span className="text-ok">
              {t("page.consentOn", {
                date: formatDate(s.consent_at, locale),
                version: s.consent_version ?? "",
              })}
            </span>
          ) : (
            <span className="text-danger">{t("page.consentMissing")}</span>
          )}
        </p>
      </Card>
      {editing && form && (
        <Sheet title={t("page.edit")} onClose={() => setEditing(false)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const body = toBody(form, { lab });
              save.mutate({
                ...body,
                // an emptied name is cleared, not left as it was
                ...(lab
                  ? {}
                  : { display_name: form.displayName.trim() || null }),
              });
            }}
          >
            {save.isError && <ErrorBanner message={errorMessage(save.error)} />}
            <SubjectFields
              form={form}
              onChange={setForm}
              lab={lab}
              consentGiven={s.consent_at != null}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditing(false)}>
                {tForm("cancel")}
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {tForm("save")}
              </Button>
            </div>
          </form>
        </Sheet>
      )}
    </section>
  );
}

function CareTeam({
  subject: s,
  manager,
}: {
  subject: Subject;
  manager: boolean;
}) {
  const t = useTranslations("subjects.care");
  const errorMessage = useErrorMessage();
  const refresh = useRefresh(s.id);
  const [chosen, setChosen] = useState("");
  const members = useQuery({
    queryKey: ["members", s.workspace_id],
    queryFn: () =>
      api.get<Member[]>(`workspaces/${s.workspace_id}/members?limit=200`),
  });
  const add = useMutation({
    mutationFn: (userId: string) =>
      api.put<Carer[]>(`subjects/${s.id}/carers/${userId}`),
    onSuccess: () => {
      setChosen("");
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (userId: string) =>
      api.delete<Carer[]>(`subjects/${s.id}/carers/${userId}`),
    onSuccess: refresh,
  });
  const caring = new Set(s.carers.map((c) => c.user_id));
  const others = (members.data ?? []).filter((m) => !caring.has(m.user_id));
  // A carer may add a colleague; an owner or admin may add anyone, themself included.
  const mayAdd = manager || s.readable;
  const failure = [add, remove].find((m) => m.isError)?.error;
  return (
    <section>
      <SectionTitle>{t("title")}</SectionTitle>
      {failure !== undefined && <ErrorBanner message={errorMessage(failure)} />}
      <Card inset>
        {s.carers.map((c) => (
          <ListRow key={c.user_id}>
            <span className="min-w-0 flex-1 truncate">
              {c.email}
              {c.you && (
                <span className="ml-2 text-[13px] text-ink-3">{t("you")}</span>
              )}
            </span>
            {manager && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (window.confirm(t("removeConfirm", { email: c.email })))
                    remove.mutate(c.user_id);
                }}
              >
                {t("remove")}
              </Button>
            )}
          </ListRow>
        ))}
        {mayAdd && (
          <form
            className="flex flex-wrap items-end gap-3 px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (chosen) add.mutate(chosen);
            }}
          >
            {members.isSuccess && others.length === 0 ? (
              <p className="text-[14px] text-ink-3">{t("nobodyElse")}</p>
            ) : (
              <>
                <Field label={t("add")} className="min-w-56 flex-1">
                  <Select
                    value={chosen}
                    onChange={(e) => setChosen(e.target.value)}
                  >
                    <option value="">{t("choose")}</option>
                    {others.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.email}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button type="submit" disabled={!chosen || add.isPending}>
                  {t("addButton")}
                </Button>
              </>
            )}
          </form>
        )}
      </Card>
      <p className="mt-3 text-[13px] text-ink-3">{t("audited")}</p>
    </section>
  );
}

function Assignments({ subject: s }: { subject: Subject }) {
  const t = useTranslations("assignments");
  const tLive = useTranslations("live");
  const remote = useRemoteConsole();
  const locale = useFormatLocale();
  const errorMessage = useErrorMessage();
  const official = useOfficialTexts();
  const refresh = useRefresh(s.id);
  const [assigning, setAssigning] = useState(false);
  const list = useQuery({
    queryKey: ["assignments", s.workspace_id, s.id],
    queryFn: () =>
      api.get<Assignment[]>(
        `workspaces/${s.workspace_id}/assignments?subject=${s.id}&limit=100`
      ),
  });
  const cancel = useMutation({
    mutationFn: (assignmentId: string) =>
      api.delete<Assignment>(`assignments/${assignmentId}`),
    onSuccess: refresh,
  });
  return (
    <section>
      <SectionTitle
        action={
          s.archived_at == null && (
            <Button size="sm" onClick={() => setAssigning(true)}>
              {t("assign")}
            </Button>
          )
        }
      >
        {t("title")}
      </SectionTitle>
      {cancel.isError && <ErrorBanner message={errorMessage(cancel.error)} />}
      <Card inset>
        {list.isSuccess && list.data.length === 0 && (
          <p className="px-5 py-4 text-ink-3">{t("none")}</p>
        )}
        {(list.data ?? []).map((a) => {
          const title = official.card({
            title: a.protocol_title,
            slug: a.protocol_slug,
            visibility: a.protocol_visibility,
          }).title;
          const state = a.open
            ? [
                a.runs_allowed == null
                  ? t("runsDone", { done: a.runs_done })
                  : t("runsOf", { done: a.runs_done, allowed: a.runs_allowed }),
                a.due_at && t("dueOn", { date: formatDate(a.due_at, locale) }),
                a.due_at && isLate(a.due_at) && t("late"),
                a.reminder && t("reminder"),
              ]
            : [t(`closed.${(a.close_reason ?? "cancelled") as "completed"}`)];
          return (
            <ListRow key={a.id} className={a.open ? undefined : "opacity-70"}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{title}</span>
                <span className="block text-[13px] text-ink-3">
                  {state.filter(Boolean).join(" · ")}
                </span>
                {a.note && (
                  <span className="mt-1 block text-[13px] text-ink-2">
                    “{a.note}”
                  </span>
                )}
              </span>
              {a.open && remote && (
                <Link
                  href={`/live/wait/${a.id}`}
                  className={buttonClass("secondary", "sm")}
                >
                  {tLive("remoteSession")}
                </Link>
              )}
              {a.open && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (window.confirm(t("cancelConfirm"))) cancel.mutate(a.id);
                  }}
                >
                  {t("cancelAssignment")}
                </Button>
              )}
            </ListRow>
          );
        })}
      </Card>
      {assigning && (
        <AssignDialog
          workspaceId={s.workspace_id}
          subjectId={s.id}
          onClose={() => setAssigning(false)}
        />
      )}
    </section>
  );
}

function Invite({ subject: s }: { subject: Subject }) {
  const t = useTranslations("subjects.invite");
  const errorMessage = useErrorMessage();
  const refresh = useRefresh(s.id);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: () =>
      api.post<Invited>(`subjects/${s.id}/invite`, { email: email.trim() }),
    onSuccess: (sent) => {
      setEmail("");
      setLink(sent.link ?? null);
      refresh();
    },
  });
  if (s.archived_at != null) return null;
  return (
    <section>
      <SectionTitle>{t("title")}</SectionTitle>
      <Card>
        {s.has_account ? (
          <p className="text-ink-2">{t("has")}</p>
        ) : (
          <>
            <p className="mb-4 text-[14px] text-ink-2">{t("text")}</p>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                invite.mutate();
              }}
            >
              <Field label={t("email")} className="min-w-56 flex-1">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Button
                type="submit"
                disabled={invite.isPending || !email.trim()}
              >
                {t("send")}
              </Button>
            </form>
            {invite.isError && (
              <div className="mt-4">
                <ErrorBanner message={errorMessage(invite.error)} />
              </div>
            )}
            {invite.isSuccess && (
              <p role="status" className="mt-4 text-[14px] text-ok">
                {t("sent")}
              </p>
            )}
            {link && (
              <div className="mt-4 rounded-xl bg-surface-2 p-4">
                <p className="text-[13px] text-ink-2">{t("manual")}</p>
                <p className="mt-2 font-mono text-[13px] break-all">{link}</p>
              </div>
            )}
          </>
        )}
      </Card>
    </section>
  );
}

function Sessions({ subject: s }: { subject: Subject }) {
  const t = useTranslations("subjects.sessionsCard");
  const tLive = useTranslations("live");
  const remote = useRemoteConsole();
  const tPage = useTranslations("subjects.page");
  const locale = useFormatLocale();
  const [choosing, setChoosing] = useState(false);
  const sessions = useQuery({
    queryKey: ["subject-sessions", s.id],
    queryFn: () => api.get<StimulusSession[]>(`subjects/${s.id}/sessions`),
  });
  return (
    <section>
      <SectionTitle
        action={
          s.archived_at == null &&
          s.consent_at != null && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setChoosing(true)}
            >
              {tPage("record")}
            </Button>
          )
        }
      >
        {t("title")}
      </SectionTitle>
      <Card inset>
        {sessions.isSuccess && sessions.data.length === 0 && (
          <p className="px-5 py-4 text-ink-3">{t("none")}</p>
        )}
        {(sessions.data ?? []).map((x) => (
          <Link
            key={x.id}
            // a run going on now opens its live room (T5), a finished one its recording
            href={
              remote && x.status === "running"
                ? `/live/${x.id}`
                : `/recordings/${x.recording_id}`
            }
            className="pressable flex items-center gap-4 border-b border-hairline px-5 py-3.5 last:border-b-0 hover:bg-surface-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{x.title}</span>
              <span className="block text-[13px] text-ink-3">
                {[
                  formatDate(x.started_at, locale),
                  t(`status.${x.status as "done"}`),
                  x.assignment_id ? t("assigned") : null,
                  remote && x.status === "running" ? tLive("watch") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </Link>
        ))}
      </Card>
      {choosing && (
        <RecordChooser subject={s} onClose={() => setChoosing(false)} />
      )}
    </section>
  );
}

/** "Record a session": pick a protocol, then Play with this person preselected. */
function RecordChooser({
  subject: s,
  onClose,
}: {
  subject: Subject;
  onClose: () => void;
}) {
  const t = useTranslations("assignments");
  const tPage = useTranslations("subjects.page");
  const official = useOfficialTexts();
  const protocols = useQuery({
    queryKey: ["protocols", "assignable"],
    queryFn: () => api.get<ProtocolCard[]>("protocols?limit=100"),
  });
  return (
    <Sheet title={tPage("record")} onClose={onClose}>
      <div className="max-h-[60vh] overflow-y-auto">
        {(protocols.data ?? []).filter(isPlayable).map((p) => (
          <Link
            key={p.id}
            href={`/protocols/${p.id}/run?subject=${s.id}`}
            className="pressable block rounded-xl px-3 py-2.5 hover:bg-surface-2"
          >
            {official.card(p).title}
          </Link>
        ))}
        {protocols.isSuccess && protocols.data.length === 0 && (
          <p className="text-ink-3">{t("chooseProtocol")}</p>
        )}
      </div>
    </Sheet>
  );
}

function ArchiveButton({ subject: s }: { subject: Subject }) {
  const t = useTranslations("subjects.page");
  const errorMessage = useErrorMessage();
  const refresh = useRefresh(s.id);
  const archive = useMutation({
    mutationFn: (archived: boolean) =>
      api.post<Subject>(`subjects/${s.id}/archive`, { archived }),
    onSuccess: refresh,
  });
  const archived = s.archived_at != null;
  return (
    <div>
      {archive.isError && <ErrorBanner message={errorMessage(archive.error)} />}
      <Button
        variant="ghost"
        onClick={() => {
          if (
            archived ||
            window.confirm(t("archiveConfirm", { name: subjectLabel(s) }))
          )
            archive.mutate(!archived);
        }}
      >
        {archived ? t("restore") : t("archive")}
      </Button>
    </div>
  );
}
