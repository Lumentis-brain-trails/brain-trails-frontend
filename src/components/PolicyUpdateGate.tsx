"use client";

/**
 * Asks again when the privacy note has moved since this account agreed (V3-0011).
 *
 * `GET /auth/me/consent` returns the version published today beside the one the account
 * actually agreed to. They differ exactly when the note has changed, and the first
 * accounts on this prototype agreed to a placeholder - a version string naming a text
 * nobody had written. Letting those people carry on without being asked again would mean
 * the only record of what they consented to is a word that means "nothing yet".
 *
 * It replaces the app rather than sitting over it: a dismissible banner is a question
 * somebody answers by ignoring it. There are two ways out, agree or sign out, and no
 * third one that quietly means "later".
 *
 * Deliberately not shown for `research`: that one is optional, so its default answer is
 * already the truthful one and nobody needs interrupting to give it.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiRequestError, api } from "@/lib/api";
import type { ConsentData } from "@/components/account/PrivacyCard";
import { Button, Card, ErrorBanner, SectionTitle } from "@/components/ui";

export function PolicyUpdateGate({ consent }: { consent: ConsentData }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const agree = useMutation({
    mutationFn: () => api.put("auth/me/consent", { core: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me-consent"] });
    },
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-6 py-16">
      <Card>
        <SectionTitle>The privacy note has changed</SectionTitle>
        <div className="mt-4 space-y-4 text-pretty text-ink-2">
          <p>
            We have published a new version of the note that explains what
            happens to your recordings and your data. Before you carry on,
            please read it and tell us you agree.
          </p>
          <p className="type-caption text-ink-3">
            You agreed to version {consent.core_version}. The current one is{" "}
            {consent.current_version}.
          </p>
        </div>

        {agree.error && (
          <div className="mt-4">
            <ErrorBanner
              message={
                agree.error instanceof ApiRequestError
                  ? agree.error.error.message
                  : "Could not save. Try again."
              }
            />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/privacy?in=tab"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-ink hover:underline"
          >
            Read the privacy note
            <span className="sr-only"> (opens in a new tab)</span>
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => agree.mutate()} disabled={agree.isPending}>
            {agree.isPending ? "Saving…" : "I have read it and I agree"}
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              await api.logout();
              router.push("/login");
            }}
          >
            Sign out
          </Button>
        </div>

        <p className="type-caption mt-6 text-ink-3">
          Would rather not agree? Write to privacy@lumentis.ca and we will
          export or delete everything we hold for you.
        </p>
      </Card>
    </main>
  );
}
