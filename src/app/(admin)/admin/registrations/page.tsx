"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiRequestError, api } from "@/lib/api";
import type { ApprovalResponse, Registration } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Icon,
  Segmented,
  Skeleton,
} from "@/components/ui";

const TABS = ["pending", "approved", "active", "rejected"] as const;
type Tab = (typeof TABS)[number];

function ProfileGrid({ profile }: { profile: Registration["profile"] }) {
  const entries = Object.entries(profile).filter(
    ([, v]) => v !== null && v !== ""
  );
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
      {entries.map(([key, value]) => (
        <div key={key} className="min-w-0">
          <dt className="type-caption text-ink-3">
            {key.replaceAll("_", " ")}
          </dt>
          <dd className="truncate text-[14px]">
            {Array.isArray(value) ? value.join(", ") : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function VerificationLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="enter-up mt-4 rounded-[var(--radius-control)] bg-warn-soft p-4">
      <p className="type-caption mb-2 font-medium text-warn">
        Manual mail mode: send this verification link to the participant.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto font-mono text-[12px] whitespace-nowrap text-ink">
          {url}
        </code>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          <Icon name={copied ? "check" : "copy"} className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export default function AdminRegistrationsPage() {
  const [tab, setTab] = useState<Tab>("pending");
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
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
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
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">Registrations</h1>
          <p className="mt-1 text-ink-2">
            Who can join. Approving generates the email-verification link.
          </p>
        </div>
        <Segmented
          label="Registration status"
          size="md"
          value={tab}
          onChange={setTab}
          options={TABS.map((t) => ({
            value: t,
            label: t.charAt(0).toUpperCase() + t.slice(1),
          }))}
        />
      </header>

      {forbidden ? (
        <ErrorBanner message="Admin role required." />
      ) : (
        <>
          {error && (
            <div className="mb-4">
              <ErrorBanner message={error} />
            </div>
          )}
          {registrations.isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
            </div>
          )}
          {registrations.data?.length === 0 && (
            <Card inset>
              <EmptyState title={`Nothing ${tab}.`} />
            </Card>
          )}
          <div className="stagger space-y-4">
            {registrations.data?.map(({ user, profile }) => (
              <Card key={user.id}>
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="type-subhead truncate">
                      {String(profile.full_name ?? user.email)}
                    </p>
                    <p className="type-caption mt-0.5 text-ink-3">
                      {user.email} · registered{" "}
                      {new Date(user.created_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <StatusBadge status={user.status} />
                </div>
                <ProfileGrid profile={profile} />
                {user.status === "pending" && (
                  <div className="mt-6 flex gap-2">
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
                    <div className="mt-5">
                      <Button
                        variant="secondary"
                        size="sm"
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
