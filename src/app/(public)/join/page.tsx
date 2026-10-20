"use client";

/**
 * Where an invitation link lands (backend V4-0001, sprint T2): `/join?token=...`.
 *
 * The page first asks what the link offers - public, since the person may have no
 * account yet - and says which organisation, which seat, and which address it was sent
 * to. Signed in, one button takes the seat; signed out, it sends them to sign in or to
 * register with that address and brings them back here. The token goes to the API in a
 * request body, never in a path.
 *
 * Accepting chooses the organisation as the current workspace and opens the app there.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useFormatLocale } from "@/i18n/formatLocale";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { useErrorMessage } from "@/lib/errorMessage";
import { formatDate } from "@/lib/format";
import type { UserInfo } from "@/lib/types";
import { type Workspace, selectWorkspace } from "@/lib/workspace";
import {
  Button,
  Card,
  ErrorBanner,
  Spinner,
  buttonClass,
} from "@/components/ui";

type Preview = components["schemas"]["InvitationPreview"];

function JoinContent() {
  const token = useSearchParams().get("token") ?? "";
  const t = useTranslations("join");
  const tKinds = useTranslations("workspaces.kinds");
  const tSeats = useTranslations("workspaces.seats");
  const errorMessage = useErrorMessage();
  const locale = useFormatLocale();

  const preview = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => api.post<Preview>("invitations/lookup", { token }),
    enabled: token.length >= 16,
    retry: false,
  });
  // Whether someone is signed in, and as whom. Not through `api`: a 401 there sends the
  // visitor to sign in, and here it only means "nobody yet" - the page offers both doors.
  const me = useQuery({
    queryKey: ["join-me"],
    queryFn: async () => {
      const response = await fetch("/api/backend/auth/me");
      return response.ok ? ((await response.json()) as UserInfo) : null;
    },
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => api.post<Workspace>("invitations/accept", { token }),
    onSuccess: (workspace) => {
      selectWorkspace(workspace.id);
      // A full load: every list is scoped to the workspace, none may show the old one.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/home");
    },
  });

  if (token.length < 16) return <ErrorBanner message={t("missingToken")} />;
  if (preview.isLoading)
    return (
      <p className="flex items-center justify-center gap-2 text-ink-2">
        <Spinner /> {t("loading")}
      </p>
    );
  if (preview.isError)
    return <ErrorBanner message={errorMessage(preview.error)} />;
  const offer = preview.data;
  if (!offer) return null;

  const here = `/join?token=${encodeURIComponent(token)}`;
  const kind = tKinds(offer.workspace_kind as "practice" | "lab");
  const sameAccount =
    me.data != null &&
    me.data.email.toLowerCase() === offer.email.toLowerCase();

  return (
    <Card className="enter-up w-full max-w-md text-center">
      <p className="type-caption text-ink-3">{kind}</p>
      <h1 className="type-title mt-1">{offer.workspace_name}</h1>
      <p className="mt-4 text-ink-2">
        {t("offer", {
          email: offer.email,
          seat: tSeats(offer.relation as "admin" | "member"),
        })}
      </p>

      {offer.state !== "open" ? (
        <div className="mt-6">
          <ErrorBanner
            message={t(
              `closed.${offer.state as "accepted" | "revoked" | "expired"}`
            )}
          />
        </div>
      ) : me.data == null ? (
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link
            href={`/login?from=${encodeURIComponent(here)}`}
            className={buttonClass("primary")}
          >
            {t("signIn")}
          </Link>
          <Link href="/register" className={buttonClass("ghost")}>
            {t("register", { email: offer.email })}
          </Link>
          <p className="text-[13px] text-ink-3">
            {t("expires", { date: formatDate(offer.expires_at, locale) })}
          </p>
        </div>
      ) : sameAccount ? (
        <div className="mt-8">
          {accept.isError && (
            <div className="mb-4">
              <ErrorBanner message={errorMessage(accept.error)} />
            </div>
          )}
          <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
            {t("accept", { name: offer.workspace_name })}
          </Button>
        </div>
      ) : (
        <div className="mt-6">
          <ErrorBanner
            message={t("otherAccount", {
              current: me.data.email,
              invited: offer.email,
            })}
          />
        </div>
      )}
    </Card>
  );
}

export default function JoinPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <Suspense>
        <JoinContent />
      </Suspense>
    </main>
  );
}
