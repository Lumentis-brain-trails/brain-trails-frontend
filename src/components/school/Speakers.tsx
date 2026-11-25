"use client";

/**
 * Who may run a school's class: its teacher and the speakers they invite (a guest who
 * presents a lesson, a colleague). A speaker holds the school's `admin` seat - the same
 * rights as the teacher: the class code, the students, the class game - and is shown
 * by another name. Invitations are the organisations' own (`POST
 * /workspaces/{id}/invitations`, 14-day link, `/join`); nothing new on the server.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import type { components } from "@/lib/api-types";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  ListRow,
  SectionTitle,
} from "@/components/ui";

type Member = components["schemas"]["MemberOut"];
type Invitation = components["schemas"]["InvitationOut"];
type Created = components["schemas"]["InvitationCreated"];

/** How a seat is named in a school. */
export function seatName(relation: string): "teacher" | "speaker" | "member" {
  if (relation === "owner") return "teacher";
  if (relation === "admin") return "speaker";
  return "member";
}

export function Speakers({ school }: { school: string }) {
  const t = useTranslations("schools.speakers");
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ["school", school, "members"],
    queryFn: () => api.get<Member[]>(`workspaces/${school}/members`),
  });
  const invitations = useQuery({
    queryKey: ["school", school, "invitations"],
    queryFn: () => api.get<Invitation[]>(`workspaces/${school}/invitations`),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["school", school] });

  const invite = useMutation({
    mutationFn: () =>
      api.post<Created>(`workspaces/${school}/invitations`, {
        email: email.trim(),
        relation: "admin",
      }),
    onSuccess: (created) => {
      setEmail("");
      setLink(created.link ?? null);
      refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api.delete(`workspaces/${school}/invitations/${id}`),
    onSuccess: refresh,
  });

  return (
    <section className="mt-12">
      <SectionTitle>{t("title")}</SectionTitle>
      <p className="mb-4 text-pretty text-ink-3">{t("intro")}</p>
      <Card className="space-y-5">
        {members.isError && (
          <ErrorBanner message={errorMessage(members.error)} />
        )}
        <div className="-mx-6">
          {(members.data ?? []).map((m) => (
            <ListRow key={m.user_id} className="justify-between">
              <span className="min-w-0 truncate">{m.email}</span>
              <span className="text-sm text-ink-2">
                {t(seatName(m.relation))}
                {m.you && ` · ${t("you")}`}
              </span>
            </ListRow>
          ))}
          {(invitations.data ?? []).map((i) => (
            <ListRow key={i.id} className="justify-between">
              <span className="min-w-0 truncate text-ink-2">{i.email}</span>
              <span className="flex items-center gap-3 text-sm text-ink-3">
                {t("invited")}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => revoke.mutate(i.id)}
                >
                  {t("revoke")}
                </Button>
              </span>
            </ListRow>
          ))}
        </div>

        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) invite.mutate();
          }}
        >
          <div className="min-w-60 flex-1">
            <Field label={t("email")}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
              />
            </Field>
          </div>
          <Button type="submit" disabled={!email.trim() || invite.isPending}>
            {t("invite")}
          </Button>
        </form>
        {invite.isError && <ErrorBanner message={errorMessage(invite.error)} />}
        {link && (
          <p className="text-sm break-all text-ink-2">
            {t("link")} <span className="select-all">{link}</span>
          </p>
        )}
      </Card>
    </section>
  );
}
