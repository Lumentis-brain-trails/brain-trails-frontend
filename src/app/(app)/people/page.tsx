"use client";

/**
 * The people of an organisation: its seats and its invitations (backend V4-0001, T2).
 *
 * Every seat sees who else works here. Owners and admins change seats, remove people
 * and invite; only an owner touches an owner's seat, and the last owner stays - the
 * backend decides all of it, this page offers only what it would allow and shows its
 * refusal otherwise. Nothing here reaches a patient's data: a seat reads a recording
 * only as that person's carer (T3), which the page says, because a clinic's owner may
 * reasonably expect otherwise.
 *
 * In manual-mail environments the backend hands the invitation link back instead of
 * mailing it; the page shows it once, to pass on by hand.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useFormatLocale } from "@/i18n/formatLocale";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { useErrorMessage } from "@/lib/errorMessage";
import { formatDate } from "@/lib/format";
import {
  type Seat,
  SEATS,
  WORKSPACES_QUERY_KEY,
  editionOf,
  managesMembers,
  seatOf,
  useCurrentWorkspace,
} from "@/lib/workspace";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  ListRow,
  SectionTitle,
  Select,
  Skeleton,
} from "@/components/ui";

type Member = components["schemas"]["MemberOut"];
type Invitation = components["schemas"]["InvitationOut"];
type Created = components["schemas"]["InvitationCreated"];
type Invitable = components["schemas"]["InvitationIn"]["relation"];

export default function PeoplePage() {
  const t = useTranslations("people");
  const tSeats = useTranslations("workspaces.seats");
  const errorMessage = useErrorMessage();
  const locale = useFormatLocale();
  const queryClient = useQueryClient();
  const workspace = useCurrentWorkspace();
  const organisation = workspace && workspace.kind !== "personal";
  const manager = managesMembers(workspace);
  const isOwner = seatOf(workspace) === "owner";
  const base = workspace ? `workspaces/${workspace.id}` : "";

  const members = useQuery({
    queryKey: ["members", workspace?.id],
    queryFn: () => api.get<Member[]>(`${base}/members?limit=200`),
    enabled: Boolean(organisation),
  });
  const invitations = useQuery({
    queryKey: ["invitations", workspace?.id],
    queryFn: () => api.get<Invitation[]>(`${base}/invitations?limit=200`),
    enabled: Boolean(organisation && manager),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["members", workspace?.id] });
    queryClient.invalidateQueries({ queryKey: ["invitations", workspace?.id] });
  };

  const [email, setEmail] = useState("");
  const [relation, setRelation] = useState<Invitable>("member");
  const [link, setLink] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: () =>
      api.post<Created>(`${base}/invitations`, {
        email: email.trim(),
        relation,
      }),
    onSuccess: (created) => {
      setEmail("");
      setLink(created.link ?? null);
      refresh();
    },
  });
  const change = useMutation({
    mutationFn: ({ id, seat }: { id: string; seat: Seat }) =>
      api.put<Member>(`${base}/members/${id}`, { relation: seat }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete<void>(`${base}/members/${id}`),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api.delete<Invitation>(`${base}/invitations/${id}`),
    onSuccess: refresh,
  });
  const leave = useMutation({
    mutationFn: () => api.post<void>(`${base}/leave`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
      // A full load: every list is scoped to the workspace, none may show the old one.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/home");
    },
  });
  const failure = [change, remove, revoke, leave].find((m) => m.isError)?.error;

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
        <EmptyState title={t("personal.title")} text={t("personal.text")} />
      </main>
    );
  }

  const edition = editionOf(workspace.kind);
  // A seat a manager may give: an admin never gives or takes an owner's seat.
  const offerable = (target: Seat): Seat[] =>
    isOwner ? [...SEATS] : target === "owner" ? [] : ["admin", "member"];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="type-title">{t("title", { name: workspace.name })}</h1>
        <p className="mt-2 text-ink-2">
          {edition === "therapy" ? t("intro.therapy") : t("intro.research")}
        </p>
      </header>

      {failure !== undefined && <ErrorBanner message={errorMessage(failure)} />}

      <SectionTitle>{t("members.title")}</SectionTitle>
      <Card inset>
        {members.isLoading && <Skeleton className="m-5 h-16" />}
        {members.isError && (
          <div className="p-5">
            <ErrorBanner message={errorMessage(members.error)} />
          </div>
        )}
        {(members.data ?? []).map((m) => {
          const seat = m.relation as Seat;
          const choices = manager && !m.you ? offerable(seat) : [];
          return (
            <ListRow key={m.user_id}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {m.email}
                  {m.you && (
                    <span className="ml-2 text-[13px] font-normal text-ink-3">
                      {t("members.you")}
                    </span>
                  )}
                </span>
                <span className="block text-[13px] text-ink-3">
                  {t("members.since", { date: formatDate(m.since, locale) })}
                </span>
              </span>
              {choices.length > 0 ? (
                <Select
                  aria-label={t("members.seatOf", { email: m.email })}
                  value={seat}
                  className="w-36"
                  onChange={(e) =>
                    change.mutate({
                      id: m.user_id,
                      seat: e.target.value as Seat,
                    })
                  }
                >
                  {choices.map((s) => (
                    <option key={s} value={s}>
                      {tSeats(s)}
                    </option>
                  ))}
                </Select>
              ) : (
                <span className="text-[14px] text-ink-2">{tSeats(seat)}</span>
              )}
              {choices.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (
                      window.confirm(
                        t("members.removeConfirm", { email: m.email })
                      )
                    )
                      remove.mutate(m.user_id);
                  }}
                >
                  {t("members.remove")}
                </Button>
              )}
              {m.you && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (
                      window.confirm(
                        t("members.leaveConfirm", { name: workspace.name })
                      )
                    )
                      leave.mutate();
                  }}
                >
                  {t("members.leave")}
                </Button>
              )}
            </ListRow>
          );
        })}
      </Card>
      <p className="mt-3 text-[13px] text-ink-3">
        {edition === "therapy" ? t("secrecy.therapy") : t("secrecy.research")}
      </p>

      {manager && (
        <>
          <SectionTitle className="mt-10">
            {t("invitations.title")}
          </SectionTitle>
          <Card>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                invite.mutate();
              }}
            >
              <Field label={t("invitations.email")} className="min-w-56 flex-1">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Field label={t("invitations.seat")}>
                <Select
                  value={relation}
                  onChange={(e) => setRelation(e.target.value as Invitable)}
                >
                  <option value="member">{tSeats("member")}</option>
                  <option value="admin">{tSeats("admin")}</option>
                </Select>
              </Field>
              <Button
                type="submit"
                disabled={invite.isPending || !email.trim()}
              >
                {t("invitations.send")}
              </Button>
            </form>
            {invite.isError && (
              <div className="mt-4">
                <ErrorBanner message={errorMessage(invite.error)} />
              </div>
            )}
            {invite.isSuccess && (
              <p role="status" className="mt-4 text-[14px] text-ok">
                {t("invitations.sent")}
              </p>
            )}
            {link && (
              <div className="mt-4 rounded-xl bg-surface-2 p-4">
                <p className="text-[13px] text-ink-2">
                  {t("invitations.manual")}
                </p>
                <p className="mt-2 font-mono text-[13px] break-all">{link}</p>
              </div>
            )}
          </Card>

          <Card inset className="mt-4">
            {(invitations.data ?? []).length === 0 && (
              <p className="px-5 py-4 text-ink-3">{t("invitations.none")}</p>
            )}
            {(invitations.data ?? []).map((i) => (
              <ListRow key={i.id}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{i.email}</span>
                  <span className="block text-[13px] text-ink-3">
                    {t("invitations.expires", {
                      seat: tSeats(i.relation as Seat),
                      date: formatDate(i.expires_at, locale),
                    })}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revoke.mutate(i.id)}
                >
                  {t("invitations.revoke")}
                </Button>
              </ListRow>
            ))}
          </Card>
        </>
      )}
    </main>
  );
}
