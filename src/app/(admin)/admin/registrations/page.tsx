"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiRequestError, api } from "@/lib/api";
import type { ApprovalResponse, Registration } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, Card, ErrorBanner } from "@/components/ui";

const TABS = ["pending", "approved", "active", "rejected"] as const;

function ProfileTable({ profile }: { profile: Registration["profile"] }) {
  const entries = Object.entries(profile).filter(
    ([, v]) => v !== null && v !== ""
  );
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="font-medium text-neutral-500">
            {key.replaceAll("_", " ")}
          </dt>
          <dd>{Array.isArray(value) ? value.join(", ") : String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function VerificationLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 rounded-md bg-amber-50 p-3 text-xs dark:bg-amber-950">
      <p className="mb-1 font-medium text-amber-800 dark:text-amber-200">
        Send this verification link to the user (manual mail mode):
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto whitespace-nowrap">{url}</code>
        <Button
          className="px-2 py-1 text-xs"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export default function AdminRegistrationsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("pending");
  const [links, setLinks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const registrations = useQuery({
    queryKey: ["registrations", tab],
    queryFn: () => api.get<Registration[]>(`admin/registrations?status=${tab}`),
    retry: false,
  });

  const decide = useMutation({
    mutationFn: ({
      userId,
      action,
    }: {
      userId: string;
      action: "approve" | "reject" | "reissue-verification";
    }) => api.post<ApprovalResponse>(`admin/registrations/${userId}/${action}`),
    onSuccess: (data) => {
      if (data.verification_url) {
        setLinks((prev) => ({
          ...prev,
          [data.user.id]: data.verification_url!,
        }));
      }
      queryClient.invalidateQueries({ queryKey: ["registrations"] });
    },
    onError: (e) =>
      setError(
        e instanceof ApiRequestError ? e.error.message : "Request failed"
      ),
  });

  const forbidden =
    registrations.error instanceof ApiRequestError &&
    registrations.error.status === 403;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-2xl font-bold">Registrations</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Review who can join Brain Trails. Approving generates the
        email-verification link.
      </p>

      {forbidden ? (
        <Card>
          <ErrorBanner message="Admin role required." />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex gap-1">
            {TABS.map((t) => (
              <Button
                key={t}
                variant={tab === t ? "primary" : "ghost"}
                className="px-3 py-1 text-xs"
                onClick={() => setTab(t)}
              >
                {t}
              </Button>
            ))}
          </div>
          {error && (
            <div className="mb-4">
              <ErrorBanner message={error} />
            </div>
          )}
          {registrations.isLoading && <Card>Loading...</Card>}
          {registrations.data?.length === 0 && (
            <Card className="text-sm text-neutral-500">Nothing here.</Card>
          )}
          <div className="space-y-4">
            {registrations.data?.map(({ user, profile }) => (
              <Card key={user.id}>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {String(profile.full_name ?? user.email)}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {user.email} · registered{" "}
                      {new Date(user.created_at).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge status={user.status} />
                </div>
                <ProfileTable profile={profile} />
                {user.status === "pending" && (
                  <div className="mt-4 flex gap-2">
                    <Button
                      onClick={() =>
                        decide.mutate({ userId: user.id, action: "approve" })
                      }
                      disabled={decide.isPending}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() =>
                        decide.mutate({ userId: user.id, action: "reject" })
                      }
                      disabled={decide.isPending}
                    >
                      Reject
                    </Button>
                  </div>
                )}
                {user.status === "approved" &&
                  !user.email_verified_at &&
                  !links[user.id] && (
                    <div className="mt-3">
                      <Button
                        variant="ghost"
                        className="px-3 py-1 text-xs"
                        onClick={() =>
                          decide.mutate({
                            userId: user.id,
                            action: "reissue-verification",
                          })
                        }
                        disabled={decide.isPending}
                      >
                        Generate a fresh verification link
                      </Button>
                    </div>
                  )}
                {links[user.id] && <VerificationLink url={links[user.id]} />}
              </Card>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
