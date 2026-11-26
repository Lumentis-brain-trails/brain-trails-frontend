"use client";

/**
 * The seats offered to this account's own address (`GET /invitations/mine`): a school's
 * speaker, a clinic's colleague. The email link still works; this is for someone who
 * already has an account and looks in the app. Taking one is `POST
 * /invitations/mine/accept` (the same rules as the link's), and the sidebar learns the
 * new workspace at once. Renders nothing when there is none.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import { WORKSPACES_QUERY_KEY } from "@/lib/workspace";
import {
  Button,
  Card,
  ErrorBanner,
  ListRow,
  SectionTitle,
} from "@/components/ui";

interface MyInvitation {
  id: string;
  workspace_name: string;
  workspace_kind: string;
  relation: string;
  expires_at: string;
}

const KEY = ["invitations", "mine"] as const;

/** How a seat is named on the card: a school's admin is its speaker. */
export function offeredSeat(
  invitation: Pick<MyInvitation, "workspace_kind" | "relation">
): "speaker" | "owner" | "admin" | "member" {
  if (invitation.workspace_kind === "school" && invitation.relation === "admin")
    return "speaker";
  if (invitation.relation === "owner" || invitation.relation === "admin")
    return invitation.relation;
  return "member";
}

export function InvitationsCard() {
  const t = useTranslations("account.invitations");
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const mine = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<MyInvitation[]>("invitations/mine"),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: (id: string) => api.post("invitations/mine/accept", { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
    },
  });

  const rows = mine.data ?? [];
  if (rows.length === 0) return null;
  return (
    <section>
      <SectionTitle>{t("title")}</SectionTitle>
      <Card inset>
        {rows.map((i) => (
          <ListRow key={i.id} className="justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate">{i.workspace_name}</span>
              <span className="type-caption text-ink-3">
                {t(`seat.${offeredSeat(i)}`)}
              </span>
            </span>
            <Button
              size="sm"
              disabled={accept.isPending}
              onClick={() => accept.mutate(i.id)}
            >
              {t("accept")}
            </Button>
          </ListRow>
        ))}
      </Card>
      {accept.isError && (
        <div className="mt-3">
          <ErrorBanner message={errorMessage(accept.error)} />
        </div>
      )}
    </section>
  );
}
