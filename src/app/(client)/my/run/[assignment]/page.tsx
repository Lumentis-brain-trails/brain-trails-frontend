"use client";

/**
 * Play, from the client shell (backend V4-0006, sprint T3): one of the person's own
 * assignments, at the version their carer chose.
 *
 * The protocol is read through the assignment (`/me/assignments/{id}/protocol`) - the
 * account cannot open the protocol itself - and the run is started with the assignment,
 * so it is recorded for them in their organisation and counts when it finishes. Back,
 * Decline and the end of the run all lead to `/my`; the end shows no score.
 */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { use } from "react";
import { api } from "@/lib/api";
import type { MyAssignment } from "@/lib/subjects";
import { RunProtocol } from "@/components/run/RunProtocol";
import { EmptyState, ErrorBanner, Spinner, buttonClass } from "@/components/ui";
import { useErrorMessage } from "@/lib/errorMessage";

export default function MyRunPage({
  params,
}: {
  params: Promise<{ assignment: string }>;
}) {
  const { assignment } = use(params);
  const t = useTranslations("my");
  const errorMessage = useErrorMessage();
  // Read once for this run: after it finishes the assignment may be done and gone from
  // the list, and the end screen must not turn into "nothing to do" under the person.
  const mine = useQuery({
    queryKey: ["me", "assignments", "run", assignment],
    queryFn: () => api.get<MyAssignment[]>("me/assignments"),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const found = mine.data?.find((a) => a.id === assignment);
  if (mine.isLoading) return <Spinner />;
  if (mine.isError)
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <ErrorBanner message={errorMessage(mine.error)} />
      </main>
    );
  // done, cancelled, or never theirs: back to the list, which says what is left
  if (!found)
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <EmptyState
          title={t("empty")}
          text={t("emptyText")}
          action={
            <Link href="/my" className={buttonClass()}>
              {t("run.back")}
            </Link>
          }
        />
      </main>
    );
  return (
    <RunProtocol
      protocolId={found.protocol_id}
      detailPath={`me/assignments/${assignment}/protocol`}
      backHref="/my"
      target={{ assignmentId: assignment }}
      client
    />
  );
}
