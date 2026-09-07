"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { UserInfo } from "@/lib/types";
import { Card } from "@/components/ui";

type ProfileData = Record<string, string | number | string[] | null>;

const HIDDEN = new Set(["consent_version", "consent_at"]);

export default function AccountPage() {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<UserInfo>("auth/me"),
  });
  const profile = useQuery({
    queryKey: ["me-profile"],
    queryFn: () => api.get<ProfileData>("auth/me/profile"),
  });

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Your account</h1>
      <div className="space-y-6">
        <Card>
          <h2 className="mb-3 font-semibold">Access</h2>
          {me.data && (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-neutral-500">Email</dt>
              <dd>{me.data.email}</dd>
              <dt className="text-neutral-500">Role</dt>
              <dd>{me.data.role}</dd>
              <dt className="text-neutral-500">Member since</dt>
              <dd>{new Date(me.data.created_at).toLocaleDateString()}</dd>
            </dl>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Profile</h2>
          {profile.isLoading && (
            <p className="text-sm text-neutral-400">Loading...</p>
          )}
          {profile.data && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              {Object.entries(profile.data)
                .filter(([k, v]) => !HIDDEN.has(k) && v !== null && v !== "")
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-neutral-500">
                      {k.replaceAll("_", " ")}
                    </dt>
                    <dd>{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
                  </div>
                ))}
            </dl>
          )}
          <p className="mt-4 text-xs text-neutral-400">
            Consent {String(profile.data?.consent_version ?? "")} accepted on{" "}
            {profile.data?.consent_at
              ? new Date(String(profile.data.consent_at)).toLocaleDateString()
              : "-"}
            . To change profile data or delete your account, contact the
            administrator (data deletion endpoints arrive with the next sprint).
          </p>
        </Card>
      </div>
    </main>
  );
}
