"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiRequestError, api } from "@/lib/api";
import type { UserInfo } from "@/lib/types";
import { Sheet } from "@/components/Sheet";
import {
  type ProfileData,
  ProfileCard,
} from "@/components/account/ProfileCard";
import { type ApplicationData, BetaCard } from "@/components/account/BetaCard";
import {
  type ConsentData,
  PrivacyCard,
} from "@/components/account/PrivacyCard";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Icon,
  Input,
  KeyValue,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import { useToast } from "@/components/Toast";

export default function AccountPage() {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<UserInfo>("auth/me"),
  });
  // 404 is the normal state of a fresh account now, not an error: registration stopped
  // asking for the profile (V3-0008, amended). `retry: false` keeps it from looking like
  // a flaky request, and `missing` is what the card explains.
  const profile = useQuery({
    queryKey: ["me-profile"],
    queryFn: () => api.get<ProfileData>("auth/me/profile"),
    retry: false,
  });
  const application = useQuery({
    queryKey: ["me-application"],
    queryFn: () => api.get<ApplicationData>("auth/me/application"),
    retry: false,
  });
  const consent = useQuery({
    queryKey: ["me-consent"],
    queryFn: () => api.get<ConsentData>("auth/me/consent"),
    retry: false,
  });

  const erase = useMutation({
    mutationFn: () => api.delete("auth/me", { password }),
    onSuccess: async () => {
      await api.logout();
      toast("success", "Your account and data were deleted.");
      router.push("/");
    },
    onError: (e) =>
      setError(
        e instanceof ApiRequestError ? e.error.message : "Request failed."
      ),
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="type-title mb-8">Account</h1>
      <div className="space-y-8">
        <section>
          <SectionTitle>Access</SectionTitle>
          <Card inset>
            {me.data ? (
              <>
                <KeyValue label="Email" value={me.data.email} />
                <KeyValue
                  label="Role"
                  value={
                    me.data.role === "admin" ? "Administrator" : "Participant"
                  }
                />
                <KeyValue
                  label="Member since"
                  value={new Date(me.data.created_at).toLocaleDateString(
                    undefined,
                    { dateStyle: "long" }
                  )}
                />
              </>
            ) : (
              <div className="space-y-2 p-5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            )}
          </Card>
        </section>

        <section>
          {profile.isLoading ? (
            <Card inset>
              <div className="space-y-2 p-5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </Card>
          ) : (
            <ProfileCard data={profile.data} missing={!profile.data} />
          )}
        </section>

        <section>
          {!consent.isLoading && <PrivacyCard data={consent.data} />}
        </section>

        <section>
          {!application.isLoading && <BetaCard data={application.data} />}
        </section>

        <section>
          <SectionTitle>Your data</SectionTitle>
          <Card inset>
            <a
              href="/api/backend/auth/me/export"
              download="brain-trails-export.json"
              className="pressable flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5 hover:bg-surface-2"
            >
              <span>
                <span className="block">Export everything</span>
                <span className="type-caption text-ink-3">
                  Profile, recordings and one-hour links to the files, as JSON.
                </span>
              </span>
              <Icon name="download" className="text-ink-3" />
            </a>
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="pressable flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left text-danger hover:bg-surface-2"
            >
              <span>
                <span className="block">Delete account</span>
                <span className="type-caption text-ink-3">
                  Removes every recording, analysis and stored file.
                </span>
              </span>
              <Icon name="trash" className="text-ink-3" />
            </button>
          </Card>
        </section>
      </div>

      {confirm && (
        <Sheet title="Delete your account?" onClose={() => setConfirm(false)}>
          <div className="space-y-4">
            <p className="text-ink-2">
              This erases your account, every recording and every stored file.
              There is no way back. Confirm with your password.
            </p>
            {error && <ErrorBanner message={error} />}
            <Field label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                Keep my account
              </Button>
              <Button
                variant="danger"
                disabled={!password || erase.isPending}
                onClick={() => erase.mutate()}
              >
                {erase.isPending ? "Deleting…" : "Delete everything"}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </main>
  );
}
