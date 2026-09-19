"use client";

/**
 * The beta selection board (backend V3-0008, sprint S15).
 *
 * Registration is an application; this page is where the sample is chosen. It lists
 * applications by decision, filters by requested profile and cohort, shows what matters
 * for the choice first - profile, credentials, headband, browser and whether it can
 * pair over Bluetooth - and decides in one gesture: accept, waitlist or reject, with a
 * cohort and a private note. Cohorts sit above the list with their targets, so the
 * sample is built on purpose. The staff app stays English (plan V3, S26).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiRequestError, api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Icon,
  Input,
  Segmented,
  Select,
  Skeleton,
  Textarea,
} from "@/components/ui";

type BoardRow = components["schemas"]["BoardRow"];
type ApprovalOut = components["schemas"]["ApprovalOut"];
type Cohort = components["schemas"]["CohortOut"];
type Decision = components["schemas"]["DecideIn"]["decision"];
type BetaProfile = components["schemas"]["BetaProfile"];

const TABS = ["pending", "waitlisted", "accepted", "rejected"] as const;
type Tab = (typeof TABS)[number];

const PROFILE_LABELS: Record<BetaProfile, string> = {
  private: "Private",
  therapist: "Therapist",
  lab_lead: "Lab lead",
  lab_member: "Lab member",
};

const ANSWER_LABELS: [keyof BoardRow["application"], string][] = [
  ["organisation", "Organisation"],
  ["role_title", "Role"],
  ["registration_no", "Registration no."],
  ["institution", "Institution"],
  ["supervisor", "Supervisor"],
  ["headband", "Headband"],
  ["device", "Device"],
  ["browser", "Browser"],
  ["country", "Country"],
  ["language", "Language"],
  ["expected_subjects", "Expected subjects"],
];

function Answers({ application }: { application: BoardRow["application"] }) {
  const rows = ANSWER_LABELS.filter(
    ([key]) => application[key] !== null && application[key] !== ""
  );
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
      {rows.map(([key, label]) => (
        <div key={key} className="min-w-0">
          <dt className="type-caption text-ink-3">{label}</dt>
          <dd className="truncate text-[14px]">{String(application[key])}</dd>
        </div>
      ))}
      <div className="min-w-0">
        <dt className="type-caption text-ink-3">Web Bluetooth</dt>
        <dd className="text-[14px]">
          {application.web_bluetooth === null
            ? "Not reported"
            : application.web_bluetooth
              ? "Yes"
              : "No - cannot pair here"}
        </dd>
      </div>
    </dl>
  );
}

function VerificationLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="enter-up mt-4 rounded-[var(--radius-control)] bg-warn-soft p-4">
      <p className="type-caption mb-2 font-medium text-warn">
        Manual mail mode: send this verification link to the applicant.
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

function Cohorts({ cohorts }: { cohorts: Cohort[] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [profile, setProfile] = useState<BetaProfile | "">("");
  const [target, setTarget] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api.post<Cohort>("admin/cohorts", {
        name,
        profile: profile || null,
        target: target ? Number(target) : null,
      }),
    onSuccess: () => {
      setName("");
      setTarget("");
      queryClient.invalidateQueries({ queryKey: ["cohorts"] });
    },
  });
  return (
    <Card>
      <p className="type-subhead mb-4">Cohorts</p>
      {cohorts.length === 0 && (
        <p className="mb-4 text-ink-3">
          No cohort yet. Create one to build the sample on purpose.
        </p>
      )}
      <ul className="mb-5 space-y-2">
        {cohorts.map((c) => (
          <li key={c.id} className="flex items-baseline justify-between gap-4">
            <span className="truncate">
              {c.name}
              {c.profile && (
                <span className="type-caption ml-2 text-ink-3">
                  {PROFILE_LABELS[c.profile]}
                </span>
              )}
            </span>
            <span className="type-caption shrink-0 text-ink-2 tabular-nums">
              {c.counts.accepted ?? 0}
              {c.target !== null && ` / ${c.target}`} accepted ·{" "}
              {c.counts.waitlisted ?? 0} waitlisted
            </span>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <Field label="New cohort">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Profile">
          <Select
            value={profile}
            onChange={(e) => setProfile(e.target.value as BetaProfile | "")}
          >
            <option value="">Any</option>
            {Object.entries(PROFILE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Target">
          <Input
            type="number"
            inputMode="numeric"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-24"
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={create.isPending}>
          Add
        </Button>
      </form>
      {create.error instanceof ApiRequestError && (
        <div className="mt-3">
          <ErrorBanner message={create.error.error.message} />
        </div>
      )}
    </Card>
  );
}

function Decide({
  row,
  cohorts,
  onDecided,
  onError,
}: {
  row: BoardRow;
  cohorts: Cohort[];
  onDecided: (data: ApprovalOut) => void;
  onError: (message: string) => void;
}) {
  const [cohort, setCohort] = useState(row.cohort?.id ?? "");
  const [note, setNote] = useState(row.application.admin_note ?? "");
  const decide = useMutation({
    mutationFn: (decision: Decision) =>
      api.post<ApprovalOut>(`admin/applications/${row.user.id}/decide`, {
        decision,
        cohort_id: cohort || null,
        note: note || null,
      }),
    onSuccess: onDecided,
    onError: (e) =>
      onError(
        e instanceof ApiRequestError ? e.error.message : "Request failed"
      ),
  });
  const current = row.application.decision;
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_2fr]">
      <Field label="Cohort">
        <Select value={cohort} onChange={(e) => setCohort(e.target.value)}>
          <option value="">No cohort</option>
          {cohorts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note (admins only)">
        <Textarea
          rows={1}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <Button
          onClick={() => decide.mutate("accept")}
          disabled={decide.isPending}
        >
          Accept
        </Button>
        {current !== "waitlisted" && (
          <Button
            variant="secondary"
            onClick={() => decide.mutate("waitlist")}
            disabled={decide.isPending}
          >
            Waitlist
          </Button>
        )}
        {current !== "rejected" && (
          <Button
            variant="danger"
            onClick={() => decide.mutate("reject")}
            disabled={decide.isPending}
          >
            Reject
          </Button>
        )}
      </div>
    </div>
  );
}

export default function AdminApplicationsPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [profile, setProfile] = useState<BetaProfile | "">("");
  const [cohort, setCohort] = useState("");
  const [links, setLinks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const params = new URLSearchParams({ decision: tab, limit: "200" });
  if (profile) params.set("profile", profile);
  if (cohort) params.set("cohort", cohort);
  const board = useQuery({
    queryKey: ["applications", params.toString()],
    queryFn: () => api.get<BoardRow[]>(`admin/applications?${params}`),
    retry: false,
  });
  const cohorts = useQuery({
    queryKey: ["cohorts"],
    queryFn: () => api.get<Cohort[]>("admin/cohorts"),
    retry: false,
  });

  const decided = (data: ApprovalOut) => {
    setError(null);
    if (data.verification_url) {
      setLinks((prev) => ({ ...prev, [data.user.id]: data.verification_url! }));
    }
    queryClient.invalidateQueries({ queryKey: ["applications"] });
    queryClient.invalidateQueries({ queryKey: ["cohorts"] });
    queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
  };
  const reissue = useMutation({
    mutationFn: (userId: string) =>
      api.post<ApprovalOut>(
        `admin/applications/${userId}/reissue-verification`
      ),
    onSuccess: decided,
    onError: (e) =>
      setError(
        e instanceof ApiRequestError ? e.error.message : "Request failed"
      ),
  });

  const forbidden =
    board.error instanceof ApiRequestError && board.error.status === 403;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">Applications</h1>
          <p className="mt-1 text-ink-2">
            Who joins the beta, and in which cohort.
          </p>
        </div>
        <Segmented
          label="Decision"
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
        <div className="space-y-6">
          <Cohorts cohorts={cohorts.data ?? []} />

          <div className="flex flex-wrap gap-3">
            <Field label="Profile">
              <Select
                value={profile}
                onChange={(e) => setProfile(e.target.value as BetaProfile | "")}
              >
                <option value="">All profiles</option>
                {Object.entries(PROFILE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cohort">
              <Select
                value={cohort}
                onChange={(e) => setCohort(e.target.value)}
              >
                <option value="">All cohorts</option>
                {(cohorts.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {error && <ErrorBanner message={error} />}
          {board.isPending && (
            <div className="space-y-3">
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
            </div>
          )}
          {board.data?.length === 0 && (
            <Card inset>
              <EmptyState title={`Nothing ${tab}.`} />
            </Card>
          )}
          <div className="stagger space-y-4">
            {board.data?.map((row) => (
              <Card key={row.user.id}>
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="type-subhead truncate">
                      {row.profile?.full_name ?? row.user.email}
                    </p>
                    <p className="type-caption mt-0.5 text-ink-3">
                      {PROFILE_LABELS[row.application.requested_profile]} ·{" "}
                      {row.user.email} · applied{" "}
                      {new Date(row.application.created_at).toLocaleString(
                        undefined,
                        { dateStyle: "medium", timeStyle: "short" }
                      )}
                      {row.cohort && ` · ${row.cohort.name}`}
                    </p>
                  </div>
                  <StatusBadge status={row.user.status} />
                </div>
                {row.application.purpose && (
                  <p className="mb-5 text-pretty text-ink-2">
                    {row.application.purpose}
                  </p>
                )}
                <Answers application={row.application} />
                {row.application.decision !== "accepted" && (
                  <Decide
                    row={row}
                    cohorts={cohorts.data ?? []}
                    onDecided={decided}
                    onError={setError}
                  />
                )}
                {row.user.status === "approved" && !links[row.user.id] && (
                  <div className="mt-5">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => reissue.mutate(row.user.id)}
                      disabled={reissue.isPending}
                    >
                      Generate a fresh verification link
                    </Button>
                  </div>
                )}
                {links[row.user.id] && (
                  <VerificationLink url={links[row.user.id]} />
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
