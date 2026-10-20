"use client";

/**
 * Where an invitation link lands (backend V4-0001, sprint T2): `/join?token=...`.
 *
 * The page first asks what the link offers - public, since the person may have no
 * account yet - and says which organisation, which seat, and which address it was sent
 * to. Signed in, one button takes the seat; signed out, it sends them to sign in or to
 * register with that address and brings them back here. The token goes to the API in a
 * request body, never in a path, and leaves the address bar as soon as it is read
 * (`useJoinToken`).
 *
 * Accepting chooses the organisation as the current workspace and opens the app there.
 *
 * A patient's or participant's invitation (relation `client`, backend T3) is another
 * door: with no account yet, the person sets a password, says they are of age and agrees
 * to the processing right here, and lands in the client shell (`/my`) - their clinic's
 * invitation stands for the beta application. With an account, they sign in and accept.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { useFormatLocale } from "@/i18n/formatLocale";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { useErrorMessage } from "@/lib/errorMessage";
import { formatDate } from "@/lib/format";
import { forgetJoinToken, useJoinToken } from "@/lib/joinToken";
import type { UserInfo } from "@/lib/types";
import { type Workspace, selectWorkspace } from "@/lib/workspace";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  Spinner,
  buttonClass,
} from "@/components/ui";

type Preview = components["schemas"]["InvitationPreview"];

function JoinContent() {
  const { token, ready } = useJoinToken();
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
      const client = preview.data?.relation === "client";
      if (!client) selectWorkspace(workspace.id);
      forgetJoinToken();
      // A full load: every list is scoped to the workspace, none may show the old one.
      window.location.assign(client ? "/my" : "/home");
    },
  });

  if (!ready) return <Spinner />;
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

  // the token stays in this tab's storage, never in a URL (`src/lib/joinToken.ts`)
  const here = "/join";
  const kind = tKinds(offer.workspace_kind as "practice" | "lab");
  if (offer.relation === "client")
    return (
      <ClientJoin
        token={token}
        offer={offer}
        signedIn={me.data ?? null}
        accept={() => accept.mutate()}
        accepting={accept.isPending}
        acceptError={accept.isError ? errorMessage(accept.error) : null}
      />
    );
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

/**
 * A patient's or participant's invitation: open an account from the link, or accept
 * with the one they have. The address is fixed - it is the one the link reached.
 */
function ClientJoin({
  token,
  offer,
  signedIn,
  accept,
  accepting,
  acceptError,
}: {
  token: string;
  offer: Preview;
  signedIn: UserInfo | null;
  accept: () => void;
  accepting: boolean;
  acceptError: string | null;
}) {
  const t = useTranslations("join");
  const tRegister = useTranslations("public.register");
  const errorMessage = useErrorMessage();
  const locale = useFormatLocale();
  // the language this form is read in: the account's first, as on registration
  const language = useLocale();
  const [password, setPassword] = useState("");
  const [adult, setAdult] = useState(false);
  const [consent, setConsent] = useState(false);
  // the token stays in this tab's storage, never in a URL (`src/lib/joinToken.ts`)
  const here = "/join";
  const register = useMutation({
    mutationFn: async () => {
      await api.post("invitations/register", {
        token,
        password,
        adult,
        consent,
        locale: language,
      });
      await api.login(offer.email, password);
    },
    onSuccess: () => {
      forgetJoinToken();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/my");
    },
  });
  const same =
    signedIn != null &&
    signedIn.email.toLowerCase() === offer.email.toLowerCase();

  return (
    <Card className="enter-up w-full max-w-md">
      <h1 className="type-title text-center">{offer.workspace_name}</h1>
      <p className="mt-4 text-center text-ink-2">
        {t("client.offer", { name: offer.workspace_name })}
      </p>
      <p className="mt-2 text-center text-[14px] text-ink-3">
        {t("client.address", { email: offer.email })}
      </p>
      {offer.state !== "open" ? (
        <div className="mt-6">
          <ErrorBanner
            message={t(
              `closed.${offer.state as "accepted" | "revoked" | "expired"}`
            )}
          />
        </div>
      ) : same ? (
        <div className="mt-8 text-center">
          {acceptError && (
            <div className="mb-4">
              <ErrorBanner message={acceptError} />
            </div>
          )}
          <Button onClick={accept} disabled={accepting}>
            {t("client.accept")}
          </Button>
        </div>
      ) : signedIn != null ? (
        <div className="mt-6">
          <ErrorBanner
            message={t("otherAccount", {
              current: signedIn.email,
              invited: offer.email,
            })}
          />
        </div>
      ) : offer.has_account ? (
        <div className="mt-8 text-center">
          <Link
            href={`/login?from=${encodeURIComponent(here)}`}
            className={buttonClass("primary")}
          >
            {t("client.signIn")}
          </Link>
        </div>
      ) : (
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            register.mutate();
          }}
        >
          {register.isError && (
            <ErrorBanner message={errorMessage(register.error)} />
          )}
          <Field label={t("client.password")} hint={t("client.passwordHint")}>
            <Input
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={200}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={adult}
              onChange={(e) => setAdult(e.target.checked)}
              className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
            />
            <span>{t("client.adult")}</span>
          </label>
          <p className="rounded-[var(--radius-card)] bg-surface-2 p-4 text-[14px] text-pretty text-ink-2">
            {tRegister.rich("consent.core", {
              link: (chunks) => (
                <Link
                  className="font-semibold text-ink hover:underline"
                  href="/privacy?in=tab"
                  target="_blank"
                  rel="noreferrer"
                >
                  {chunks}
                </Link>
              ),
              hidden: (chunks) => <span className="sr-only">{chunks}</span>,
            })}
          </p>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
            />
            <span>{tRegister("consent.coreTick")}</span>
          </label>
          <Button
            type="submit"
            className="w-full"
            disabled={
              password.length < 10 || !adult || !consent || register.isPending
            }
          >
            {t("client.create")}
          </Button>
          <p className="text-center text-[13px] text-ink-3">
            {t("expires", { date: formatDate(offer.expires_at, locale) })}
          </p>
        </form>
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
