"use client";

/**
 * Asking for a clinic or a laboratory (backend V4-0001, sprint T2).
 *
 * A request waits for a platform admin, as every account did during the beta; nothing
 * can be built in it until then. The page shows the person's own requests under the
 * form, so a request does not disappear into a queue they cannot see. The name is the
 * organisation's own and is shown as typed.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useFormatLocale } from "@/i18n/formatLocale";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { useErrorMessage } from "@/lib/errorMessage";
import { useFeature } from "@/lib/features";
import { formatDate } from "@/lib/format";
import {
  type Workspace,
  WORKSPACES_QUERY_KEY,
  useWorkspaces,
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
  Segmented,
} from "@/components/ui";

type Kind = components["schemas"]["WorkspaceRequestIn"]["kind"];

export default function RequestOrganisationPage() {
  const t = useTranslations("organisationRequest");
  const tKinds = useTranslations("workspaces.kinds");
  const errorMessage = useErrorMessage();
  const locale = useFormatLocale();
  const enabled = useFeature("workspaces_multi");
  const queryClient = useQueryClient();
  const workspaces = useWorkspaces();
  const [kind, setKind] = useState<Kind>("practice");
  const [name, setName] = useState("");

  const send = useMutation({
    mutationFn: () =>
      api.post<Workspace>("workspaces", { kind, name: name.trim() }),
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
    },
  });

  if (!enabled) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <EmptyState title={t("unavailable")} />
      </main>
    );
  }

  const requests = (workspaces.data ?? []).filter((w) => w.kind !== "personal");

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <h1 className="type-title">{t("title")}</h1>
        <p className="mt-2 text-ink-2">{t("intro")}</p>
      </header>

      <Card>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink-2">
              {t("kind")}
            </p>
            <Segmented
              label={t("kind")}
              size="md"
              value={kind}
              onChange={setKind}
              options={[
                { value: "practice", label: tKinds("practice") },
                { value: "lab", label: tKinds("lab") },
              ]}
            />
            <p className="mt-2 text-[13px] text-ink-3">
              {kind === "practice" ? t("practiceHint") : t("labHint")}
            </p>
          </div>
          <Field label={t("name")} hint={t("nameHint")}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={200}
              required
            />
          </Field>
          {send.isError && <ErrorBanner message={errorMessage(send.error)} />}
          {send.isSuccess && (
            <p role="status" className="text-[14px] text-ok">
              {t("sent")}
            </p>
          )}
          <Button
            type="submit"
            disabled={send.isPending || name.trim().length < 2}
          >
            {t("submit")}
          </Button>
        </form>
      </Card>

      <SectionTitle className="mt-10">{t("yours")}</SectionTitle>
      {requests.length === 0 ? (
        <p className="text-ink-3">{t("none")}</p>
      ) : (
        <Card inset>
          {requests.map((w) => (
            <ListRow key={w.id}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{w.name}</span>
                <span className="block text-[13px] text-ink-3">
                  {t("requestedOn", {
                    kind: tKinds(w.kind as Kind),
                    date: formatDate(w.created_at, locale),
                  })}
                </span>
              </span>
              <span className="text-[13px] text-ink-2">
                {t(
                  `status.${w.status as "pending" | "active" | "rejected" | "archived"}`
                )}
              </span>
            </ListRow>
          ))}
        </Card>
      )}
    </main>
  );
}
